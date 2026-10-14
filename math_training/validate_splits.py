#!/usr/bin/env python3
"""
RIYAI OpenMathReasoning Split Validation & Integrity Check
===========================================================
Validates:
1. File existence and line count of train.jsonl, val.jsonl, test.jsonl.
2. JSON parsing and schema completeness for every line.
3. Problem deduplication and zero contamination between train, val, and test.
4. Correctness of mapped fields (problem, generated_solution, expected_answer, messages).
5. Statistical distribution of token/character lengths.
"""

import os
import sys
import json
import hashlib
from typing import Dict, List, Set, Any

DATA_DIR = os.path.join(os.path.dirname(__file__), "data")


def hash_problem(text: str) -> str:
    normalized = " ".join(text.strip().lower().split())
    return hashlib.sha256(normalized.encode("utf-8")).hexdigest()


def validate_file(file_path: str, split_name: str) -> Dict[str, Any]:
    if not os.path.exists(file_path):
        return {"error": f"File not found: {file_path}"}

    records: List[Dict[str, Any]] = []
    hashes: Set[str] = set()
    errors: List[str] = []

    problem_lens: List[int] = []
    solution_lens: List[int] = []

    with open(file_path, "r", encoding="utf-8") as f:
        for line_no, line in enumerate(f, start=1):
            line = line.strip()
            if not line:
                continue
            try:
                item = json.loads(line)
            except json.JSONDecodeError as e:
                errors.append(f"Line {line_no}: Invalid JSON ({e})")
                continue

            # Schema validation
            for req in ["id", "problem", "generated_solution", "expected_answer", "messages"]:
                if req not in item or not item[req]:
                    errors.append(f"Line {line_no}: Missing required field '{req}'")

            # Messages validation
            msgs = item.get("messages", [])
            if len(msgs) != 3:
                errors.append(f"Line {line_no}: Expected 3 messages (system, user, assistant), got {len(msgs)}")
            else:
                roles = [m.get("role") for m in msgs]
                if roles != ["system", "user", "assistant"]:
                    errors.append(f"Line {line_no}: Unexpected roles {roles}")

            p_text = item.get("problem", "")
            s_text = item.get("generated_solution", "")
            problem_lens.append(len(p_text))
            solution_lens.append(len(s_text))

            h = hash_problem(p_text)
            if h in hashes:
                errors.append(f"Line {line_no}: Internal duplicate problem detected inside {split_name}")
            hashes.add(h)
            records.append(item)

    avg_p = sum(problem_lens) / len(problem_lens) if problem_lens else 0
    avg_s = sum(solution_lens) / len(solution_lens) if solution_lens else 0

    return {
        "split": split_name,
        "count": len(records),
        "hashes": hashes,
        "errors": errors,
        "avg_problem_len": round(avg_p, 1),
        "avg_solution_len": round(avg_s, 1),
        "min_solution_len": min(solution_lens) if solution_lens else 0,
        "max_solution_len": max(solution_lens) if solution_lens else 0,
    }


def main():
    print("=" * 60)
    print("RIYAI OpenMathReasoning Dataset Validation")
    print("=" * 60)

    splits = ["train", "val", "test"]
    results: Dict[str, Dict[str, Any]] = {}

    for s in splits:
        fpath = os.path.join(DATA_DIR, f"{s}.jsonl")
        res = validate_file(fpath, s)
        results[s] = res

        if "error" in res:
            print(f"[FAIL] {s.upper()}: {res['error']}")
            sys.exit(1)

        print(f"\n[+] Split: {s.upper()}")
        print(f"    - Count: {res['count']} records")
        print(f"    - Avg Problem Length:  {res['avg_problem_len']} chars")
        print(f"    - Avg Solution Length: {res['avg_solution_len']} chars (range: {res['min_solution_len']} - {res['max_solution_len']})")
        print(f"    - Errors / Malformed: {len(res['errors'])}")
        if res["errors"]:
            for err in res["errors"][:5]:
                print(f"      * {err}")

    # Check for contamination / overlaps between splits
    train_h = results["train"]["hashes"]
    val_h = results["val"]["hashes"]
    test_h = results["test"]["hashes"]

    train_val_overlap = train_h.intersection(val_h)
    train_test_overlap = train_h.intersection(test_h)
    val_test_overlap = val_h.intersection(test_h)

    print("\n" + "=" * 60)
    print("Contamination & Leakage Inspection:")
    print("=" * 60)
    print(f"    - Train <-> Val Overlap:  {len(train_val_overlap)} problems")
    print(f"    - Train <-> Test Overlap: {len(train_test_overlap)} problems")
    print(f"    - Val <-> Test Overlap:   {len(val_test_overlap)} problems")

    has_leakage = bool(train_val_overlap or train_test_overlap or val_test_overlap)
    total_errors = sum(len(results[s]["errors"]) for s in splits)

    if has_leakage or total_errors > 0:
        print("\n[!] Validation FAILED with integrity issues.")
        sys.exit(1)
    else:
        print("\n[PASS] ALL VALIDATION CHECKS PASSED: Zero data contamination, 100% valid schemas.")


if __name__ == "__main__":
    main()
