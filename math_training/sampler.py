#!/usr/bin/env python3
"""
RIYAI OpenMathReasoning Streaming Sampler & Splitter
=====================================================
Streams a controlled, high-quality sample from the Hugging Face dataset:
https://huggingface.co/datasets/MontenTech/OpenMathReasoning

Dataset Attribution & License:
- Source: MontenTech/OpenMathReasoning (ArXiv: 2504.16891)
- License: Creative Commons Attribution 4.0 International (CC-BY-4.0)
- Provenance: AoPS (Art of Problem Solving) olympiad/competition math
- Reasoning Format: DeepSeek-R1 chain-of-thought traces with <think>...</think>

Rules & Safety Guarantees:
- Zero full-dataset download: Streams directly via lightweight page requests.
- Validates non-empty problems, generated solutions, and expected answers.
- Preserves expected_answer separately as ground-truth evaluation benchmark.
- Strictly separates Train, Validation, and Test splits with fixed seed (zero overlap).
"""

import os
import sys
import json
import random
import hashlib
import urllib.request
import urllib.error
from typing import List, Dict, Any, Set

DATASET_NAME = "MontenTech/OpenMathReasoning"
SPLIT_NAME = "cot"
LICENSE = "CC-BY-4.0"
AUTHOR = "MontenTech"
ARXIV = "2504.16891"

DEFAULT_SAMPLE_TARGET = 350  # 350 high-quality unique examples
PAGE_SIZE = 100
RANDOM_SEED = 42

OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "data")


def fetch_page(offset: int, limit: int = 100) -> List[Dict[str, Any]]:
    """Fetch a page of rows from Hugging Face Dataset Viewer API."""
    url = (
        f"https://datasets-server.huggingface.co/rows"
        f"?dataset={DATASET_NAME}&config=default&split={SPLIT_NAME}"
        f"&offset={offset}&limit={limit}"
    )
    headers = {
        "User-Agent": "RIYAI-OpenMathReasoning-Sampler/1.0 (Research)"
    }
    req = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            rows = [item.get("row", {}) for item in data.get("rows", [])]
            return rows
    except urllib.error.URLError as e:
        print(f"[ERROR] Failed to fetch page at offset {offset}: {e}", file=sys.stderr)
        return []


def hash_text(text: str) -> str:
    """Compute sha256 prefix for problem deduplication."""
    normalized = " ".join(text.strip().lower().split())
    return hashlib.sha256(normalized.encode("utf-8")).hexdigest()[:16]


def validate_and_transform_row(row: Dict[str, Any], seen_hashes: Set[str]) -> Dict[str, Any] | None:
    """Validate data integrity and map fields into conversational format."""
    problem = (row.get("problem") or "").strip()
    generated_solution = (row.get("generated_solution") or "").strip()
    expected_answer = (row.get("expected_answer") or "").strip()

    # Integrity rules
    if len(problem) < 15:
        return None
    if len(generated_solution) < 30:
        return None
    if not expected_answer:
        return None

    # Deduplication check
    p_hash = hash_text(problem)
    if p_hash in seen_hashes:
        return None
    seen_hashes.add(p_hash)

    # Standard conversational training format
    messages = [
        {
            "role": "system",
            "content": (
                "You are RIYAI, an advanced mathematical reasoning assistant. "
                "Carefully reason through the problem step-by-step within <think> tags "
                "before presenting your clear final answer in \\boxed{}."
            ),
        },
        {"role": "user", "content": problem},
        {"role": "assistant", "content": generated_solution},
    ]

    return {
        "id": f"omr_cot_{p_hash}",
        "problem": problem,
        "generated_solution": generated_solution,
        "expected_answer": expected_answer,
        "problem_type": row.get("problem_type") or "unknown",
        "problem_source": row.get("problem_source") or "aops",
        "generation_model": row.get("generation_model") or "DeepSeek-R1",
        "pass_rate_72b_tir": row.get("pass_rate_72b_tir") or "unknown",
        "inference_mode": row.get("inference_mode") or "cot",
        "used_in_kaggle": bool(row.get("used_in_kaggle", False)),
        "messages": messages,
    }


def stream_dataset(target_count: int = DEFAULT_SAMPLE_TARGET) -> List[Dict[str, Any]]:
    """Stream valid, deduplicated rows from the dataset until target_count is reached."""
    print(f"[*] Connecting to Hugging Face dataset: {DATASET_NAME} (split: {SPLIT_NAME})")
    print(f"[*] Target valid examples: {target_count}")
    print("[*] Streaming in pages of 100 without downloading the 50GB Parquet shards...")

    collected: List[Dict[str, Any]] = []
    seen_hashes: Set[str] = set()
    offset = 0
    consecutive_empty = 0

    while len(collected) < target_count and consecutive_empty < 3:
        page_rows = fetch_page(offset, PAGE_SIZE)
        if not page_rows:
            consecutive_empty += 1
            offset += PAGE_SIZE
            continue

        consecutive_empty = 0
        for row in page_rows:
            transformed = validate_and_transform_row(row, seen_hashes)
            if transformed:
                collected.append(transformed)
                if len(collected) >= target_count:
                    break

        print(f"    - Offset {offset:4d}: Total valid unique samples so far = {len(collected)}")
        offset += len(page_rows)

    return collected


def split_data(
    records: List[Dict[str, Any]],
    train_ratio: float = 0.80,
    val_ratio: float = 0.10,
    test_ratio: float = 0.10,
    seed: int = RANDOM_SEED,
) -> Dict[str, List[Dict[str, Any]]]:
    """Deterministically partition records into Train, Validation, and Test."""
    random.seed(seed)
    shuffled = records.copy()
    random.shuffle(shuffled)

    n_total = len(shuffled)
    n_train = int(n_total * train_ratio)
    n_val = int(n_total * val_ratio)

    train_data = shuffled[:n_train]
    val_data = shuffled[n_train : n_train + n_val]
    test_data = shuffled[n_train + n_val :]

    return {
        "train": train_data,
        "val": val_data,
        "test": test_data,
    }


def save_jsonl(records: List[Dict[str, Any]], file_path: str) -> None:
    """Save records to line-delimited JSON format."""
    with open(file_path, "w", encoding="utf-8") as f:
        for r in records:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")


def main():
    target = int(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_SAMPLE_TARGET
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    records = stream_dataset(target_count=target)
    if not records:
        print("[!] No records could be collected. Please check internet connection.", file=sys.stderr)
        sys.exit(1)

    print(f"\n[+] Successfully collected {len(records)} verified records.")

    splits = split_data(records)
    train_path = os.path.join(OUTPUT_DIR, "train.jsonl")
    val_path = os.path.join(OUTPUT_DIR, "val.jsonl")
    test_path = os.path.join(OUTPUT_DIR, "test.jsonl")

    save_jsonl(splits["train"], train_path)
    save_jsonl(splits["val"], val_path)
    save_jsonl(splits["test"], test_path)

    summary = {
        "dataset_name": DATASET_NAME,
        "split_name": SPLIT_NAME,
        "license": LICENSE,
        "author": AUTHOR,
        "arxiv": ARXIV,
        "total_sampled": len(records),
        "split_counts": {
            "train": len(splits["train"]),
            "val": len(splits["val"]),
            "test": len(splits["test"]),
        },
        "random_seed": RANDOM_SEED,
        "files": {
            "train": os.path.abspath(train_path),
            "val": os.path.abspath(val_path),
            "test": os.path.abspath(test_path),
        },
    }

    summary_path = os.path.join(OUTPUT_DIR, "dataset_summary.json")
    with open(summary_path, "w", encoding="utf-8") as f:
        json.dump(summary, f, indent=2)

    print(f"\n[+] Splits successfully created in: {OUTPUT_DIR}")
    print(f"    - Train: {len(splits['train'])} examples -> {train_path}")
    print(f"    - Val:   {len(splits['val'])} examples -> {val_path}")
    print(f"    - Test:  {len(splits['test'])} examples -> {test_path}")
    print(f"    - Metadata: {summary_path}")


if __name__ == "__main__":
    main()
