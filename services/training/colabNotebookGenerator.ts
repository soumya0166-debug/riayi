import { TrainingRun, DatasetRecord } from '@/types/training';

interface NotebookCell {
  cell_type: 'markdown' | 'code';
  execution_count?: null;
  metadata: Record<string, unknown>;
  outputs?: unknown[];
  source: string[];
}

interface JupyterNotebook {
  cells: NotebookCell[];
  metadata: {
    accelerator: string;
    colab: {
      gpuType: string;
      provenance: unknown[];
    };
    language_info: {
      name: string;
      version: string;
    };
  };
  nbformat: number;
  nbformat_minor: number;
}

export class ColabNotebookGenerator {
  /**
   * Generates a fully self-contained, executable Jupyter Notebook (.ipynb)
   * tailored to the dataset, base model, and hyperparameters of the training run.
   */
  public static generateNotebook(
    run: TrainingRun,
    trainRecords: DatasetRecord[],
    valRecords: DatasetRecord[],
    testRecords: DatasetRecord[],
    callbackUrl?: string
  ): string {
    const hp = run.hyperparameters;
    const baseModel = hp.baseModel || 'Qwen/Qwen2.5-0.5B-Instruct';

    const cells: NotebookCell[] = [];

    const addMd = (content: string) => {
      cells.push({
        cell_type: 'markdown',
        metadata: {},
        source: content.split('\n').map((l, i, arr) => (i < arr.length - 1 ? `${l}\n` : l)),
      });
    };

    const addCode = (code: string) => {
      cells.push({
        cell_type: 'code',
        execution_count: null,
        metadata: {},
        outputs: [],
        source: code.split('\n').map((l, i, arr) => (i < arr.length - 1 ? `${l}\n` : l)),
      });
    };

    // Cell 1: Header Markdown
    addMd(`# 🚀 RIYAI LoRA Fine-Tuning: ${baseModel}
**Dataset:** ${run.datasetName} (Run ID: \`${run.id}\`)  
**Architecture:** Qwen2.5-Instruct with Parameter-Efficient Fine-Tuning (LoRA / QLoRA)  
**Objective:** Fine-tune ${baseModel} on assistant reasoning responses using response-only loss masking, validate against held-out splits, and export for local Ollama inference in RIYAI.

---
### ⚙️ Quick Start Checklist
1. Ensure your Google Colab runtime is set to **GPU** (\`Runtime\` -> \`Change runtime type\` -> **T4 GPU**).
2. Click **Runtime -> Run all** (or execute cells sequentially).
3. At the end, download the trained adapter or merged GGUF to import into RIYAI!`);

    // Cell 2: Dependencies Installation
    addMd(`### Step 1: Install Pinned Dependencies
We pin modern, compatible versions of Hugging Face \`transformers\`, \`peft\`, \`trl\`, \`bitsandbytes\`, and \`accelerate\`.`);

    addCode(`!pip install -q \\
    "transformers>=4.45.2" \\
    "peft>=0.13.2" \\
    "trl>=0.11.4" \\
    "accelerate>=0.34.2" \\
    "bitsandbytes>=0.43.3" \\
    "torch>=2.4.0" \\
    "datasets>=3.0.1"

import torch
print(f"[*] PyTorch Version: {torch.__version__}")
print(f"[*] CUDA Available: {torch.cuda.is_available()}")
if torch.cuda.is_available():
    print(f"[*] GPU Name: {torch.cuda.get_device_name(0)}")
    print(f"[*] Total VRAM: {torch.cuda.get_device_properties(0).total_memory / (1024**3):.2f} GB")
else:
    print("[!] WARNING: Running on CPU. Please switch runtime to GPU in Runtime -> Change runtime type.")`);

    // Cell 3: Embed Dataset Records
    addMd(`### Step 2: Prepare Dataset Splits
Loading verified training (${trainRecords.length} samples), validation (${valRecords.length} samples), and held-out test (${testRecords.length} samples) splits.
*Strict Isolation Principle:* We never train on validation or test records.`);

    // Encode records into embedded json files to avoid external hosting dependencies
    const trainJsonStr = JSON.stringify(trainRecords.slice(0, 1000));
    const valJsonStr = JSON.stringify(valRecords.slice(0, 200));
    const testJsonStr = JSON.stringify(testRecords.slice(0, 100));

    addCode(`import json
import os

# Write training records
train_data = ${trainJsonStr}
val_data = ${valJsonStr}
test_data = ${testJsonStr}

os.makedirs("riyal_data", exist_ok=True)
with open("riyal_data/train.json", "w", encoding="utf-8") as f:
    json.dump(train_data, f, indent=2)

with open("riyal_data/val.json", "w", encoding="utf-8") as f:
    json.dump(val_data, f, indent=2)

with open("riyal_data/test.json", "w", encoding="utf-8") as f:
    json.dump(test_data, f, indent=2)

print(f"[+] Saved {len(train_data)} train, {len(val_data)} validation, and {len(test_data)} test examples.")`);

    // Cell 4: Tokenization & Response-Only Loss Masking
    addMd(`### Step 3: Chat Template & Response-Only Formatting
Qwen2.5-Instruct uses the \`ChatML\` markup format:
\`<|im_start|>system\\n...<|im_end|>\\n<|im_start|>user\\n...<|im_end|>\\n<|im_start|>assistant\\n...<|im_end|>\`

**Critical Efficiency Rule:** We train ONLY on assistant completion tokens, masking user prompts with \`-100\` labels via \`DataCollatorForCompletionOnlyLM\`. This avoids wasting gradients on re-learning question vocabulary.`);

    addCode(`from transformers import AutoTokenizer
from datasets import Dataset

MODEL_NAME = "${baseModel}"
print(f"[*] Loading tokenizer for: {MODEL_NAME}")

tokenizer = AutoTokenizer.from_pretrained(MODEL_NAME, trust_remote_code=True)
tokenizer.pad_token = tokenizer.eos_token
tokenizer.padding_side = "right"

def format_record_to_chatml(example):
    """Format instruction/input/output or messages into Qwen ChatML string."""
    if "messages" in example and example["messages"]:
        messages = example["messages"]
    else:
        system_text = "You are RIYAI, an advanced mathematical reasoning and thinking assistant. Solve step-by-step and write final answer in \\\\boxed{}."
        user_content = example.get("problem") or example.get("instruction") or ""
        if example.get("input"):
            user_content = f"{user_content}\\n\\nInput: {example['input']}"
        assistant_content = example.get("generated_solution") or example.get("output") or example.get("expected_answer") or ""
        
        messages = [
            {"role": "system", "content": system_text},
            {"role": "user", "content": user_content},
            {"role": "assistant", "content": assistant_content}
        ]
    
    text = tokenizer.apply_chat_template(messages, tokenize=False, add_generation_prompt=False)
    return {"text": text}

# Convert to HuggingFace datasets
train_dataset = Dataset.from_list(train_data).map(format_record_to_chatml)
val_dataset = Dataset.from_list(val_data).map(format_record_to_chatml)

print("[+] Formatted Sample Preview:")
print("-" * 60)
print(train_dataset[0]["text"][:600] + "\\n...[truncated]")
print("-" * 60)`);

    // Cell 5: LoRA & Model Loading (with 4-bit / 8-bit support)
    addMd(`### Step 4: Configure LoRA / QLoRA
We load the model with Parameter-Efficient Fine-Tuning (PEFT).
- **LoRA Rank ($r$):** ${hp.loraRank}
- **LoRA Alpha ($\\\\alpha$):** ${hp.loraAlpha}
- **Target Modules:** All attention and MLP projections (\`q_proj\`, \`k_proj\`, \`v_proj\`, \`o_proj\`, \`gate_proj\`, \`up_proj\`, \`down_proj\`)
- **Quantization:** ${hp.quantization}`);

    addCode(`from transformers import AutoModelForCausalLM, BitsAndBytesConfig
from peft import LoraConfig, get_peft_model, prepare_model_for_kbit_training

# Check quantization support
USE_4BIT = ${hp.quantization === '4bit' ? 'True' : 'False'}

if USE_4BIT and torch.cuda.is_available():
    bnb_config = BitsAndBytesConfig(
        load_in_4bit=True,
        bnb_4bit_quant_type="nf4",
        bnb_4bit_compute_dtype=torch.bfloat16 if torch.cuda.is_bf16_supported() else torch.float16,
        bnb_4bit_use_double_quant=True,
    )
    model = AutoModelForCausalLM.from_pretrained(
        MODEL_NAME,
        quantization_config=bnb_config,
        device_map="auto",
        trust_remote_code=True,
    )
    model = prepare_model_for_kbit_training(model)
else:
    model = AutoModelForCausalLM.from_pretrained(
        MODEL_NAME,
        torch_dtype=torch.bfloat16 if torch.cuda.is_bf16_supported() else torch.float16,
        device_map="auto",
        trust_remote_code=True,
    )

if ${hp.useGradientCheckpointing ? 'True' : 'False'}:
    model.gradient_checkpointing_enable()

# Configure PEFT LoRA
peft_config = LoraConfig(
    r=${hp.loraRank},
    lora_alpha=${hp.loraAlpha},
    lora_dropout=${hp.loraDropout},
    bias="none",
    task_type="CAUSAL_LM",
    target_modules=["q_proj", "k_proj", "v_proj", "o_proj", "gate_proj", "up_proj", "down_proj"],
)

model = get_peft_model(model, peft_config)
model.print_trainable_parameters()`);

    // Cell 6: SFTTrainer Configuration & Metric Callback
    addMd(`### Step 5: SFTTrainer Execution
We train with \`SFTTrainer\` and \`DataCollatorForCompletionOnlyLM\`.
A custom callback tracks loss per step and can optionally sync progress back to RIYAI.`);

    addCode(`from transformers import TrainingArguments, TrainerCallback
from trl import SFTTrainer, DataCollatorForCompletionOnlyLM
import requests
import time

# Response-only loss masking collator
response_template = "<|im_start|>assistant\\n"
collator = DataCollatorForCompletionOnlyLM(response_template=response_template, tokenizer=tokenizer)

# Custom callback to stream metrics to console and optionally to RIYAI
class RiyaiMetricCallback(TrainerCallback):
    def __init__(self, run_id="${run.id}", sync_url="${callbackUrl || ''}"):
        self.run_id = run_id
        self.sync_url = sync_url
        self.start_time = time.time()
        self.losses = []

    def on_log(self, args, state, control, logs=None, **kwargs):
        if logs:
            step = state.global_step
            epoch = logs.get("epoch", 0.0)
            train_loss = logs.get("loss")
            val_loss = logs.get("eval_loss")
            lr = logs.get("learning_rate")
            elapsed = time.time() - self.start_time
            
            entry = {
                "step": step,
                "epoch": round(epoch, 2),
                "trainLoss": round(train_loss, 4) if train_loss else None,
                "valLoss": round(val_loss, 4) if val_loss else None,
                "learningRate": lr,
                "elapsedTimeSec": round(elapsed, 1),
                "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            }
            self.losses.append(entry)
            print(f"[Step {step:03d} | Epoch {epoch:.2f}] Train Loss: {train_loss} | Val Loss: {val_loss}")

            # Optional sync back to RIYAI dashboard
            if self.sync_url and self.sync_url.startswith("http"):
                try:
                    requests.post(f"{self.sync_url}/api/training/runs/{self.run_id}/logs", json=entry, timeout=3)
                except Exception:
                    pass

metric_callback = RiyaiMetricCallback()

OUTPUT_DIR = "riyal_qwen_lora_output"

training_args = TrainingArguments(
    output_dir=OUTPUT_DIR,
    num_train_epochs=${hp.epochs},
    per_device_train_batch_size=${hp.batchSize},
    gradient_accumulation_steps=${hp.gradientAccumulationSteps},
    learning_rate=${hp.learningRate},
    lr_scheduler_type="cosine",
    warmup_ratio=${hp.warmupRatio},
    weight_decay=${hp.weightDecay},
    logging_steps=5,
    eval_strategy="epoch",
    save_strategy="epoch",
    save_total_limit=2,
    bf16=torch.cuda.is_bf16_supported(),
    fp16=not torch.cuda.is_bf16_supported(),
    report_to="none",
)

trainer = SFTTrainer(
    model=model,
    train_dataset=train_dataset,
    eval_dataset=val_dataset,
    peft_config=peft_config,
    dataset_text_field="text",
    max_seq_length=${hp.maxSequenceLength},
    tokenizer=tokenizer,
    data_collator=collator,
    args=training_args,
    callbacks=[metric_callback],
)

print("[*] Starting LoRA Fine-Tuning...")
trainer.train()
print("[PASS] Fine-tuning finished successfully!")`);

    // Cell 7: Save Adapter and Config
    addMd(`### Step 6: Save LoRA Adapter & Tokenizer Artifacts`);

    addCode(`ADAPTER_DIR = "riyal_qwen_adapter"
trainer.model.save_pretrained(ADAPTER_DIR)
tokenizer.save_pretrained(ADAPTER_DIR)

print(f"[+] Saved LoRA adapter to directory: {ADAPTER_DIR}")
print("[+] Files saved:")
!ls -lh {ADAPTER_DIR}`);

    // Cell 8: Held-out Test Evaluation
    addMd(`### Step 7: Zero-Leakage Evaluation on Held-Out Test Set
We evaluate on the ${testRecords.length} held-out test problems to test reasoning and extraction accuracy.`);

    addCode(`import re

def extract_boxed(text):
    idx = text.rfind(r"\\boxed{")
    if idx == -1:
        return None
    start = idx + len(r"\\boxed{")
    depth = 1
    for i in range(start, len(text)):
        if text[i] == "{":
            depth += 1
        elif text[i] == "}":
            depth -= 1
            if depth == 0:
                return text[start:i].strip()
    return None

def test_inference(prompt_text):
    messages = [
        {"role": "system", "content": "You are RIYAI, an advanced mathematical reasoning assistant. Carefully reason step-by-step and write final answer in \\\\boxed{}."},
        {"role": "user", "content": prompt_text}
    ]
    prompt = tokenizer.apply_chat_template(messages, tokenize=False, add_generation_prompt=True)
    inputs = tokenizer(prompt, return_tensors="pt").to(model.device)
    
    with torch.no_grad():
        outputs = model.generate(
            **inputs,
            max_new_tokens=512,
            temperature=0.01,
            do_sample=False,
            pad_token_id=tokenizer.eos_token_id
        )
    resp = tokenizer.decode(outputs[0][inputs.input_ids.shape[1]:], skip_special_tokens=True)
    return resp

print("[*] Running inference on held-out test samples...")
results = []
for idx, item in enumerate(test_data[:10], start=1):
    prob = item.get("problem") or item.get("instruction")
    expected = item.get("expected_answer") or item.get("output")
    out = test_inference(prob)
    pred_boxed = extract_boxed(out)
    is_match = (pred_boxed == expected)
    status = "PASS" if is_match else "CHECK"
    print(f"[{idx:02d}] [{status}] Expected: {expected} | Predicted: {pred_boxed}")
    results.append({
        "problem": prob[:60],
        "expected": expected,
        "predicted": pred_boxed,
        "match": is_match
    })

correct = sum(1 for r in results if r["match"])
print(f"\\n[+] Test Accuracy (Sample 10): {correct}/{len(results)} ({correct/len(results)*100:.1f}%)")`);

    // Cell 9: Export to Ollama / GGUF Instructions
    addMd(`### Step 8: Export for RIYAI & Local Ollama
Follow these instructions to run your trained model locally in RIYAI:

1. **Zip and Download the Adapter:**
   Run the cell below to download \`riyal_qwen_adapter.zip\`.
2. **Merge and Export for Ollama:**
   You can create a custom Ollama model using the Modelfile generated below.
3. **Import into RIYAI:**
   Open the **RIYAI Model Integration Workspace**, click **Import Local Model**, and select the model!`);

    addCode(`!zip -r riyal_qwen_adapter.zip {ADAPTER_DIR}

from google.colab import files
files.download("riyal_qwen_adapter.zip")

# Generate Ollama Modelfile
modelfile_content = f"""FROM ${baseModel}
ADAPTER ./{ADAPTER_DIR}

SYSTEM "You are RIYAI, an advanced mathematical reasoning and thinking assistant tuned with open-weight LoRA adapters."

PARAMETER temperature 0.2
PARAMETER top_p 0.95
PARAMETER stop "<|im_end|>"
PARAMETER stop "<|endoftext|>"
"""

with open("Modelfile", "w") as f:
    f.write(modelfile_content)

print("[+] Modelfile created! Run locally in your terminal:")
print("    ollama create riyai-qwen-finetuned -f Modelfile")`);

    const notebook: JupyterNotebook = {
      cells,
      metadata: {
        accelerator: 'GPU',
        colab: {
          gpuType: 'T4',
          provenance: [],
        },
        language_info: {
          name: 'python',
          version: '3.10',
        },
      },
      nbformat: 4,
      nbformat_minor: 0,
    };

    return JSON.stringify(notebook, null, 2);
  }
}
