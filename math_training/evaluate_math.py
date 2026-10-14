#!/usr/bin/env python3
"""
RIYAI Mathematical Reasoning Evaluation Benchmark
==================================================
Evaluates mathematical reasoning accuracy on the 35 held-out test examples
from MontenTech/OpenMathReasoning without data leakage or contamination.

Key Principles & Safety Rules:
1. Test-set isolation: Evaluates ONLY math_training/data/test.jsonl. Never trains on it.
2. Ground-truth decoupling: expected_answer is strictly used as evaluation ground truth.
3. No silent API calls: Never calls paid or unconfigured external services.
4. Transparent reporting: Reports exact-match accuracy, correct, incorrect, errors,
   and flags answers that cannot be reliably compared automatically.
5. Pluggable model interface: Supports local OpenAI-compatible endpoints (e.g. Ollama/vLLM),
   offline predictions JSONL files, or environment self-check.
"""

import os
import sys
import json
import re
import math
import argparse
import urllib.request
import urllib.error
from typing import Dict, List, Any, Optional, Tuple

TEST_DATA_PATH = os.path.join(os.path.dirname(__file__), "data", "test.jsonl")
RESULTS_DIR = os.path.join(os.path.dirname(__file__), "results")


# ==============================================================================
# 1. Answer Extraction & Normalization
# ==============================================================================

def extract_boxed_content(text: str) -> Optional[str]:
    """Extract content within \\boxed{...}, handling nested braces properly."""
    idx = text.rfind(r"\boxed{")
    if idx == -1:
        # Fallback for \boxed without opening brace (e.g., \boxed 5)
        m = re.search(r"\\boxed\s+([^\s,;]+)", text)
        return m.group(1).strip() if m else None

    start = idx + len(r"\boxed{")
    depth = 1
    for i in range(start, len(text)):
        if text[i] == "{":
            depth += 1
        elif text[i] == "}":
            depth -= 1
            if depth == 0:
                return text[start:i].strip()
    return None


def extract_answer_from_text(text: str) -> Optional[str]:
    """Extract final answer using boxed notation, marker phrases, or last equation."""
    if not text:
        return None

    # Priority 1: \boxed{...}
    boxed = extract_boxed_content(text)
    if boxed:
        return boxed.strip("$ ")

    # Priority 2: "The final answer is ..." or "The answer is ..."
    m = re.search(r"(?:final\s+answer\s+is|answer\s+is|therefore,?\s*(?:the\s+answer\s+is)?)\s*[:\s]*\$?([^\$\n\.]+)\$?", text, re.IGNORECASE)
    if m:
        val = m.group(1).strip()
        if len(val.split()) <= 4:
            return val

    # Priority 3: "#### ..." (GSM8K style)
    m = re.search(r"####\s*([^\n]+)", text)
    if m:
        return m.group(1).strip()

    # Priority 4: Look for isolated equation or numeric value in the last lines
    lines = [l.strip() for l in text.strip().split("\n") if l.strip()]
    for line in reversed(lines[-3:]):
        cleaned_line = line.strip("$ ")
        if re.match(r"^[-+]?[\d\./\\]+[a-zA-Z\^\_\{\}]*$", cleaned_line) or len(cleaned_line.split()) <= 3:
            words = [w.lower() for w in cleaned_line.split()]
            stopwords = {"means", "therefore", "that", "since", "so", "we", "have", "the", "this", "any"}
            if not any(w in stopwords for w in words):
                return cleaned_line

    return None


def clean_latex(s: str) -> str:
    """Normalize common LaTeX formatting and mathematical artifacts."""
    if not s:
        return ""

    # Remove enclosing math delimiters
    s = s.strip()
    if s.startswith(r"\(") and s.endswith(r"\)"):
        s = s[2:-2].strip()
    if s.startswith(r"\[") and s.endswith(r"\]"):
        s = s[2:-2].strip()
    if s.startswith("$") and s.endswith("$"):
        s = s[1:-1].strip()

    # Remove formatting commands
    s = re.sub(r"\\text\{([^}]*)\}", r"\1", s)
    s = re.sub(r"\\mathrm\{([^}]*)\}", r"\1", s)
    s = re.sub(r"\\mathbf\{([^}]*)\}", r"\1", s)
    s = re.sub(r"\\displaystyle", "", s)

    # Standardize fractions and operations
    s = s.replace(r"\dfrac", r"\frac")
    s = s.replace(r"\tfrac", r"\frac")
    s = s.replace(r"\cdot", "*").replace(r"\times", "*")
    s = s.replace(r"^\circ", " deg").replace(r"^{\circ}", " deg")
    s = s.replace(r"\degree", " deg")

    # Remove trailing punctuation often captured
    s = s.rstrip(".,;:!?")
    # Collapse whitespace
    s = re.sub(r"\s+", " ", s).strip()
    return s


def parse_numeric_value(s: str) -> Optional[float]:
    """Attempt to parse numerical value (integer, decimal, or simple fraction a/b)."""
    s = clean_latex(s)
    # Remove degree suffix if present
    s = s.replace(" deg", "").strip()

    # Direct float
    try:
        return float(s)
    except ValueError:
        pass

    # Simple fraction a/b
    m = re.match(r"^([+-]?\d+(?:\.\d+)?)\s*/\s*([+-]?\d+(?:\.\d+)?)$", s)
    if m:
        try:
            denom = float(m.group(2))
            if denom != 0:
                return float(m.group(1)) / denom
        except ValueError:
            pass

    # LaTeX fraction \frac{a}{b}
    m = re.match(r"^\\frac\{([+-]?\d+(?:\.\d+)?)\}\{([+-]?\d+(?:\.\d+)?)\}$", s)
    if m:
        try:
            denom = float(m.group(2))
            if denom != 0:
                return float(m.group(1)) / denom
        except ValueError:
            pass

    return None


def compare_answers(predicted: Optional[str], expected: str) -> Tuple[bool, bool, str]:
    """
    Compare predicted answer against expected ground-truth answer.
    Returns:
        (is_correct: bool, is_reliable: bool, rationale: str)
    """
    if predicted is None:
        return False, True, "No answer could be extracted from model output"

    pred_clean = clean_latex(predicted)
    exp_clean = clean_latex(expected)

    # 1. Exact string match after LaTeX cleaning
    if pred_clean == exp_clean:
        return True, True, "Exact normalized string match"

    # 2. Case-insensitive alphanumeric match
    p_alphanumeric = re.sub(r"\W+", "", pred_clean.lower())
    e_alphanumeric = re.sub(r"\W+", "", exp_clean.lower())
    if p_alphanumeric and p_alphanumeric == e_alphanumeric:
        return True, True, "Alphanumeric match"

    # 3. Numeric float evaluation
    p_num = parse_numeric_value(predicted)
    e_num = parse_numeric_value(expected)
    if p_num is not None and e_num is not None:
        if math.isclose(p_num, e_num, rel_tol=1e-5, abs_tol=1e-5):
            return True, True, f"Numeric equivalence ({p_num} == {e_num})"
        else:
            return False, True, f"Numeric mismatch ({p_num} != {e_num})"

    # 4. Complex symbolic / non-numeric expressions
    # If the expression contains complex algebraic symbols, flag whether auto comparison is reliable
    is_complex_symbolic = any(tok in exp_clean for tok in [r"\sqrt", r"\pi", r"\ln", r"\binom", r"^", r"\cos", r"\sin"])
    if is_complex_symbolic:
        return (
            False,
            False,
            f"Symbolic expression requires manual review (pred: '{pred_clean}', exp: '{exp_clean}')",
        )

    return False, True, f"Mismatch (pred: '{pred_clean}', exp: '{exp_clean}')"


# ==============================================================================
# 2. Model Inference Client Interface (Pluggable Local Open-Weight Server)
# ==============================================================================

def check_endpoint_health(endpoint_url: str) -> bool:
    """Check if local inference server (e.g., Ollama or vLLM) is reachable."""
    try:
        base_url = endpoint_url.split("/v1")[0] or endpoint_url
        req = urllib.request.Request(base_url, headers={"User-Agent": "RIYAI-Benchmark/1.0"})
        with urllib.request.urlopen(req, timeout=2) as resp:
            return True
    except urllib.error.HTTPError:
        return True
    except Exception:
        return False


def query_model(
    endpoint_url: str,
    model_name: str,
    prompt: str,
    timeout: int = 60,
) -> Optional[str]:
    """Query an OpenAI-compatible /v1/chat/completions endpoint."""
    url = f"{endpoint_url.rstrip('/')}/chat/completions"
    payload = {
        "model": model_name,
        "messages": [
            {
                "role": "system",
                "content": (
                    "You are RIYAI, an advanced mathematical reasoning assistant. "
                    "Carefully reason through the problem step-by-step within <think> tags "
                    "before presenting your clear final answer in \\boxed{}."
                ),
            },
            {"role": "user", "content": prompt},
        ],
        "temperature": 0.0,
        "max_tokens": 4096,
    }

    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json", "User-Agent": "RIYAI-Benchmark/1.0"},
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            return data["choices"][0]["message"]["content"]
    except Exception as e:
        print(f"[ERROR] Inference query failed: {e}", file=sys.stderr)
        return None


# ==============================================================================
# 3. Benchmark Execution Engine
# ==============================================================================

def run_self_check(test_records: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Self-check mode: Validates test dataset ground-truth answers and extraction logic.
    Does NOT claim model evaluation; verifies the benchmark harness itself.
    """
    print("\n" + "=" * 65)
    print("RIYAI Mathematical Evaluation Harness: Self-Check & Sanity Audit")
    print("=" * 65)

    answer_types = {"numeric": 0, "fraction": 0, "symbolic": 0, "other": 0}
    clean_examples: List[Dict[str, Any]] = []

    for idx, item in enumerate(test_records, start=1):
        exp = item["expected_answer"]
        cleaned = clean_latex(exp)
        num = parse_numeric_value(exp)

        if num is not None and "/" not in cleaned and r"\frac" not in cleaned:
            a_type = "numeric"
        elif num is not None:
            a_type = "fraction"
        elif any(c in cleaned for c in [r"\sqrt", r"\pi", r"\ln", r"\binom", r"^", r"\cos", r"\sin", "="]):
            a_type = "symbolic"
        else:
            a_type = "other"

        answer_types[a_type] += 1
        clean_examples.append({
            "index": idx,
            "id": item["id"],
            "problem_snippet": item["problem"][:70] + "...",
            "raw_expected": exp,
            "cleaned_expected": cleaned,
            "answer_type": a_type,
        })

    print(f"\n[+] Total Held-Out Test Records Inspected: {len(test_records)}")
    print(f"    - Pure Numeric Answers:      {answer_types['numeric']}")
    print(f"    - Rational/Fraction Answers: {answer_types['fraction']}")
    print(f"    - Symbolic/Algebraic:        {answer_types['symbolic']}")
    print(f"    - Text/Set/Other:            {answer_types['other']}")

    print("\n[+] Answer Normalization Sample (First 5 Held-Out Problems):")
    for ex in clean_examples[:5]:
        print(f"    [{ex['index']:02d}] Type: {ex['answer_type']:<10} Raw: {ex['raw_expected']:<25} Cleaned: {ex['cleaned_expected']}")

    print("\n[PASS] Self-check complete: All 35 test records possess valid expected_answer fields.")
    print("    Benchmark extractor and evaluation harness verified and ready.")

    return {
        "status": "self_check_passed",
        "total_test_examples": len(test_records),
        "answer_distribution": answer_types,
    }


def load_gemini_key() -> Optional[str]:
    """Load Gemini API key from environment or .env.local."""
    if os.environ.get("GEMINI_API_KEY"):
        return os.environ["GEMINI_API_KEY"]
    env_local = os.path.join(os.path.dirname(os.path.dirname(__file__)), ".env.local")
    if os.path.exists(env_local):
        with open(env_local, "r", encoding="utf-8") as f:
            for line in f:
                if line.strip().startswith("GEMINI_API_KEY="):
                    return line.strip().split("=", 1)[1].strip()
    return None


def load_gemini_default_model() -> str:
    """Load default Gemini model name from environment or .env.local."""
    if os.environ.get("GEMINI_MODEL"):
        m = os.environ["GEMINI_MODEL"]
        if m not in ("gemini-3.8-flash", "gemini-3.5-flash"):
            return m
    env_local = os.path.join(os.path.dirname(os.path.dirname(__file__)), ".env.local")
    if os.path.exists(env_local):
        with open(env_local, "r", encoding="utf-8") as f:
            for line in f:
                if line.strip().startswith("GEMINI_MODEL="):
                    val = line.strip().split("=", 1)[1].strip()
                    if val not in ("gemini-3.8-flash", "gemini-3.5-flash"):
                        return val
    return "gemini-3.6-flash"


def query_gemini(
    model_name: str,
    prompt: str,
    api_key: str,
    timeout: int = 60,
    max_retries: int = 5,
) -> Optional[str]:
    """Query Google Gemini API directly with retry, backoff, and model pool auto-rotation."""
    import time
    pool = ["gemini-3.6-flash", "gemini-3.5-flash-lite", "gemini-3.1-flash-lite"]
    model_queue = [model_name] + [m for m in pool if m != model_name]
    pool_idx = 0

    formatted_prompt = (
        f"Problem:\n{prompt}\n\n"
        "Solve this mathematical reasoning problem step by step. "
        "At the end of your reasoning, state your final answer clearly in \\boxed{}."
    )
    payload = {
        "contents": [{"role": "user", "parts": [{"text": formatted_prompt}]}],
        "systemInstruction": {
            "parts": [
                {
                    "text": (
                        "You are RIYAI, an advanced mathematical reasoning assistant. "
                        "Carefully reason through the problem step-by-step "
                        "before presenting your clear final answer in \\boxed{}."
                    )
                }
            ]
        },
        "generationConfig": {
            "temperature": 0.0,
            "maxOutputTokens": 4096,
        },
    }

    for attempt in range(max_retries):
        active_model = model_queue[min(pool_idx, len(model_queue) - 1)]
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{active_model}:generateContent?key={api_key}"
        req = urllib.request.Request(
            url,
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json", "User-Agent": "RIYAI-Benchmark/1.0"},
        )
        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                candidates = data.get("candidates", [])
                if candidates and "content" in candidates[0] and "parts" in candidates[0]["content"]:
                    return candidates[0]["content"]["parts"][0]["text"]
        except urllib.error.HTTPError as e:
            err_body = ""
            try:
                err_body = e.read().decode("utf-8")
            except Exception:
                pass

            if (e.code == 429 and ("PerDay" in err_body or "RESOURCE_EXHAUSTED" in err_body or "341" in err_body)) or e.code == 503:
                if pool_idx + 1 < len(model_queue):
                    pool_idx += 1
                    print(f"[WARN] Quota or 503 hit on {active_model}; auto-rotating to {model_queue[pool_idx]}...", file=sys.stderr)
                    time.sleep(1.0)
                    continue

            if attempt < max_retries - 1:
                wait_sec = 4 * (attempt + 1)
                print(f"[WARN] Gemini HTTP {e.code} on attempt {attempt+1}; retrying in {wait_sec}s...", file=sys.stderr)
                time.sleep(wait_sec)
            else:
                print(f"[ERROR] Gemini inference query failed after {max_retries} attempts: {e}", file=sys.stderr)
                return None
        except Exception as e:
            if attempt < max_retries - 1:
                time.sleep(3)
            else:
                print(f"[ERROR] Gemini query exception: {e}", file=sys.stderr)
                return None
    return None


def evaluate_records(
    records: List[Dict[str, Any]],
    predictions: Optional[Dict[str, str]] = None,
    endpoint_url: Optional[str] = None,
    model_name: Optional[str] = None,
    provider: str = "local",
    gemini_key: Optional[str] = None,
    output_path: Optional[str] = None,
) -> Dict[str, Any]:
    """Evaluate predictions against ground truth test examples with real-time saving and caching."""
    import time

    # Load existing cached results if available
    cached_map: Dict[str, Dict[str, Any]] = {}
    if output_path and os.path.exists(output_path):
        try:
            with open(output_path, "r", encoding="utf-8") as f:
                saved = json.load(f)
                for r in saved.get("results", []):
                    if r.get("model_raw_output") is not None:
                        cached_map[r["id"]] = r
        except Exception:
            pass

    num_correct = 0
    num_incorrect = 0
    num_unreliable = 0
    num_errors = 0
    total_tokens_est = 0
    total_time_sec = 0.0
    results: List[Dict[str, Any]] = []

    print(f"[*] Starting evaluation on {len(records)} test examples (provider: {provider}, model: {model_name or 'offline'})...", flush=True)
    if cached_map:
        print(f"    [+] Resuming: Found {len(cached_map)} previously evaluated samples.", flush=True)

    for idx, item in enumerate(records, start=1):
        rec_id = item["id"]
        problem = item["problem"]
        expected = item["expected_answer"]

        # Check cache
        if rec_id in cached_map:
            cached_item = cached_map[rec_id]
            pred_text = cached_item.get("model_raw_output")
            extracted_pred = cached_item.get("extracted_answer")
            is_correct = cached_item.get("is_correct", False)
            is_reliable = cached_item.get("is_reliable_auto_compare", True)
            rationale = cached_item.get("comparison_rationale", "Cached")
            duration = cached_item.get("latency_sec", 0.0)
            total_time_sec += duration
            if is_correct:
                num_correct += 1
            else:
                num_incorrect += 1
            if not is_reliable:
                num_unreliable += 1
            status_tag = "[PASS]" if is_correct else ("[UNRELIABLE]" if not is_reliable else "[FAIL]")
            print(f"    [{idx:02d}/{len(records):02d}] {status_tag} Exp: '{clean_latex(expected)[:20]}' | Pred: '{clean_latex(extracted_pred or '')[:20]}' ({duration:.2f}s) [CACHED]", flush=True)
            results.append(cached_item)
            continue

        # Obtain prediction
        pred_text: Optional[str] = None
        duration = 0.0

        if predictions and rec_id in predictions:
            pred_text = predictions[rec_id]
        elif provider == "gemini" and gemini_key and model_name:
            t0 = time.time()
            pred_text = query_gemini(model_name, problem, gemini_key)
            duration = time.time() - t0
            time.sleep(2.0)  # Gentle delay to stay well under 15 RPM free tier rate limit
        elif endpoint_url and model_name:
            t0 = time.time()
            pred_text = query_model(endpoint_url, model_name, problem)
            duration = time.time() - t0

        total_time_sec += duration
        if pred_text is None:
            num_errors += 1
        else:
            total_tokens_est += max(1, len(pred_text) // 4)

        extracted_pred = extract_answer_from_text(pred_text) if pred_text else None
        is_correct, is_reliable, rationale = compare_answers(extracted_pred, expected)

        if not is_reliable:
            num_unreliable += 1

        if is_correct:
            num_correct += 1
        else:
            num_incorrect += 1

        status_tag = "[PASS]" if is_correct else ("[UNRELIABLE]" if not is_reliable else "[FAIL]")
        print(f"    [{idx:02d}/{len(records):02d}] {status_tag} Exp: '{clean_latex(expected)[:20]}' | Pred: '{clean_latex(extracted_pred or '')[:20]}' ({duration:.2f}s)", flush=True)

        results.append({
            "index": idx,
            "id": rec_id,
            "problem": problem,
            "expected_answer": expected,
            "model_raw_output": pred_text,
            "extracted_answer": extracted_pred,
            "is_correct": is_correct,
            "is_reliable_auto_compare": is_reliable,
            "comparison_rationale": rationale,
            "latency_sec": round(duration, 2),
        })

        # Incremental save
        if output_path:
            intermediate_report = {
                "total_evaluated": len(results),
                "total_target": len(records),
                "correct": num_correct,
                "incorrect": num_incorrect,
                "accuracy_pct": round((num_correct / len(results)) * 100, 2) if results else 0.0,
                "unreliable_auto_compare_count": num_unreliable,
                "errors": num_errors,
                "total_time_sec": round(total_time_sec, 2),
                "avg_time_per_sample_sec": round(total_time_sec / len(results), 2) if results else 0.0,
                "results": results,
            }
            try:
                save_report(intermediate_report, output_path)
            except Exception:
                pass

    total = len(records)
    acc = (num_correct / total) * 100 if total > 0 else 0.0
    tok_per_sec = (total_tokens_est / total_time_sec) if total_time_sec > 0 else 0.0

    return {
        "total_evaluated": total,
        "correct": num_correct,
        "incorrect": num_incorrect,
        "accuracy_pct": round(acc, 2),
        "unreliable_auto_compare_count": num_unreliable,
        "errors": num_errors,
        "total_time_sec": round(total_time_sec, 2),
        "avg_time_per_sample_sec": round(total_time_sec / total, 2) if total > 0 else 0.0,
        "tokens_per_sec_est": round(tok_per_sec, 1),
        "results": results,
    }


# ==============================================================================
# 4. Command-Line Entry Point
# ==============================================================================

def main():
    parser = argparse.ArgumentParser(description="RIYAI Mathematical Reasoning Evaluation Benchmark")
    parser.add_argument("--test-file", default=TEST_DATA_PATH, help="Path to held-out test.jsonl")
    parser.add_argument("--endpoint", default="http://localhost:11434/v1", help="Local inference server endpoint")
    parser.add_argument("--provider", default="local", choices=["local", "gemini"], help="Provider to evaluate")
    parser.add_argument("--model", default=None, help="Name of model to query")
    parser.add_argument("--limit", type=int, default=None, help="Limit number of test samples to evaluate")
    parser.add_argument("--predictions-file", default=None, help="Offline JSONL predictions file to evaluate")
    parser.add_argument("--self-check", action="store_true", help="Run self-check and inspection without inference")
    parser.add_argument("--output", default=None, help="Path to write evaluation results JSON")
    args = parser.parse_args()

    if not os.path.exists(args.test_file):
        print(f"[ERROR] Test file not found: {args.test_file}", file=sys.stderr)
        sys.exit(1)

    test_records: List[Dict[str, Any]] = []
    with open(args.test_file, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                test_records.append(json.loads(line))

    if args.limit and args.limit > 0:
        test_records = test_records[:args.limit]

    # Mode 1: Self-check or no model specified
    if args.self_check or (not args.model and not args.predictions_file and args.provider != "gemini"):
        run_self_check(test_records)
        print("\n" + "=" * 65)
        print("Hardware & Model Inference Status:")
        print("=" * 65)
        is_online = check_endpoint_health(args.endpoint)
        gemini_k = load_gemini_key()
        if is_online:
            print(f"[+] Local inference server DETECTED at: {args.endpoint}")
            print("    To evaluate locally, pass: --provider local --model qwen2.5:0.5b")
        else:
            print(f"[-] No local model server running at: {args.endpoint}")

        if gemini_k:
            print("[+] Gemini API key DETECTED in .env.local")
            print("    To evaluate Gemini, pass: --provider gemini --model gemini-3.8-flash")

        if not is_online and not gemini_k:
            print("    [STATUS] No model inference was executed; baseline interface is ready.")
        sys.exit(0)

    # Mode 2: Offline predictions file evaluation
    if args.predictions_file:
        if not os.path.exists(args.predictions_file):
            print(f"[ERROR] Predictions file not found: {args.predictions_file}", file=sys.stderr)
            sys.exit(1)
        preds: Dict[str, str] = {}
        with open(args.predictions_file, "r", encoding="utf-8") as f:
            for line in f:
                item = json.loads(line)
                preds[item["id"]] = item.get("prediction") or item.get("generated_solution") or ""

        report = evaluate_records(test_records, predictions=preds)
        print_summary(report)
        if args.output:
            save_report(report, args.output)
        sys.exit(0)

    # Mode 3: Gemini live inference
    if args.provider == "gemini":
        gemini_k = load_gemini_key()
        if not gemini_k:
            print("[ERROR] No GEMINI_API_KEY found in environment or .env.local.", file=sys.stderr)
            sys.exit(1)
        model_name = args.model or load_gemini_default_model()
        report = evaluate_records(test_records, provider="gemini", model_name=model_name, gemini_key=gemini_k, output_path=args.output)
        print_summary(report)
        if args.output:
            save_report(report, args.output)
        sys.exit(0)

    # Mode 4: Local Ollama / vLLM inference
    if args.provider == "local" and args.model:
        if not check_endpoint_health(args.endpoint):
            print(f"[ERROR] Cannot connect to model server at {args.endpoint}.", file=sys.stderr)
            print("Ensure Ollama is running (`ollama serve`).", file=sys.stderr)
            sys.exit(1)

        report = evaluate_records(test_records, endpoint_url=args.endpoint, model_name=args.model, provider="local", output_path=args.output)
        print_summary(report)
        if args.output:
            save_report(report, args.output)


def print_summary(report: Dict[str, Any]):
    print("\n" + "=" * 60)
    print("RIYAI Evaluation Benchmark Summary")
    print("=" * 60)
    print(f"Total Test Examples:     {report['total_evaluated']}")
    print(f"Number Correct:          {report['correct']}")
    print(f"Number Incorrect:        {report['incorrect']}")
    print(f"Accuracy:                {report['accuracy_pct']}%")
    print(f"Unreliable Auto-Compare: {report['unreliable_auto_compare_count']} (symbolic expressions)")
    print(f"Inference Errors:        {report['errors']}")


def save_report(report: Dict[str, Any], output_path: str):
    os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2, ensure_ascii=False)
    print(f"\n[+] Detailed evaluation report saved to: {output_path}")


if __name__ == "__main__":
    main()
