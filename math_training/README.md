# RIYAI — OpenMathReasoning Integration Module

This dedicated directory manages the mathematical reasoning dataset pipeline for RIYAI, derived from the Hugging Face dataset:
**[`MontenTech/OpenMathReasoning`](https://huggingface.co/datasets/MontenTech/OpenMathReasoning)**.

---

## Dataset Provenance & Attribution

- **Dataset Name**: `MontenTech/OpenMathReasoning`
- **Authors**: MontenTech / NVIDIA community contributors
- **ArXiv Reference**: [2504.16891](https://arxiv.org/abs/2504.16891)
- **License**: **Creative Commons Attribution 4.0 International (CC-BY-4.0)**
  - *You are free to share, copy, redistribute, adapt, and build upon the material for any purpose, including commercial, provided appropriate credit is given.*
- **Data Source**: Art of Problem Solving (AoPS) competition and Olympiad problems.
- **Reasoning Model**: DeepSeek-R1 long chain-of-thought traces with `<think>...</think>` tags and boxed answers (`\boxed{...}`).

---

## Directory Structure

```
math_training/
├── data/
│   ├── train.jsonl            # 80% partition for training (280 records)
│   ├── val.jsonl              # 10% partition for validation (35 records)
│   ├── test.jsonl             # 10% held-out test split for evaluation (35 records)
│   └── dataset_summary.json   # Metadata, provenance, and hash records
├── sampler.py                 # Safe streaming sampler (zero 50GB downloads)
├── validate_splits.py         # Integrity and zero-contamination validator
├── evaluate_math.py           # Mathematical evaluation benchmark harness
└── README.md                  # This documentation & license notice
```

---

## Evaluation Benchmark (`evaluate_math.py`)

The evaluation script provides a standardized benchmark for testing mathematical reasoning accuracy against the 35 held-out test problems:

1. **Self-Check / Harness Audit**:
   ```bash
   uv run python math_training/evaluate_math.py --self-check
   ```
2. **Offline Predictions Evaluation**:
   ```bash
   uv run python math_training/evaluate_math.py --predictions-file predictions.jsonl
   ```
3. **Live Local Model Inference** (Ollama / vLLM):
   ```bash
   uv run python math_training/evaluate_math.py --endpoint http://localhost:11434/v1 --model qwen2.5:1.5b
   ```

Key evaluation features:
- **Nested `\boxed{}` parser**: Correctly handles multi-level nested LaTeX braces.
- **Normalization engine**: Strips LaTeX math delimiters, simplifies fraction syntax, normalizes operation symbols, and evaluates numerical equivalence.
- **Symbolic transparency**: Flags complex non-numeric expressions requiring manual inspection rather than reporting false positives or false negatives.
- **Safety guarantee**: Will not call paid external APIs or claim inference when a server is offline.

---

## Schema per Record

Each record in `train.jsonl`, `val.jsonl`, and `test.jsonl` contains:

| Field | Type | Description |
| :--- | :--- | :--- |
| `id` | `string` | Unique identifier based on problem content hash (`omr_cot_<hash>`) |
| `problem` | `string` | The competition math question prompt |
| `generated_solution` | `string` | Full step-by-step reasoning trace with `<think>...</think>` |
| `expected_answer` | `string` | Ground truth target answer (kept for evaluation, not assumed perfect) |
| `problem_type` | `string` | Mathematical category (algebra, geometry, number theory, etc.) |
| `problem_source` | `string` | Origin forum category |
| `generation_model` | `string` | Origin LLM (`DeepSeek-R1`) |
| `pass_rate_72b_tir` | `string` | Verification reliability metric |
| `inference_mode` | `string` | Mode (`cot` = Chain-of-Thought) |
| `messages` | `array` | Conversational OpenAI/Chat format for SFT (`system`, `user`, `assistant`) |

---

## Guarantees & Safeguards

1. **Zero Data Leakage**: Problem hashes ensure zero overlap between `train`, `val`, and `test`.
2. **Ground Truth Separation**: `expected_answer` is explicitly decoupled from `generated_solution`.
3. **Application Isolation**: All scripts and data are strictly contained within `math_training/`, preserving all existing RIYAI Next.js UI, API routes, and components without modification.
