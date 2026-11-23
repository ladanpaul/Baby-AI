from __future__ import annotations

import argparse
import json
import os
import time
from pathlib import Path

import torch
from diffusers import DiffusionPipeline
from huggingface_hub.errors import GatedRepoError


def parse_args() -> argparse.Namespace:
  parser = argparse.ArgumentParser()
  parser.add_argument('--prompt', required=True)
  parser.add_argument('--output', required=True)
  parser.add_argument('--model-id', default='black-forest-labs/FLUX.1-schnell')
  parser.add_argument('--width', type=int, default=768)
  parser.add_argument('--height', type=int, default=768)
  parser.add_argument('--steps', type=int, default=4)
  return parser.parse_args()


def resolve_device() -> tuple[str, torch.dtype]:
  if torch.backends.mps.is_available():
    return 'mps', torch.float16

  return 'cpu', torch.float32


def main() -> None:
  args = parse_args()
  output_path = Path(args.output)
  output_path.parent.mkdir(parents=True, exist_ok=True)

  device, dtype = resolve_device()
  started_at = time.perf_counter()

  try:
    pipeline = DiffusionPipeline.from_pretrained(
      args.model_id,
      torch_dtype=dtype,
      token=os.getenv('HF_TOKEN') or None,
    )
  except GatedRepoError as error:
    raise SystemExit(
      'FLUX.1-schnell requires Hugging Face access. Accept the model terms on '
      'Hugging Face and authenticate locally with HF_TOKEN or huggingface-cli login.'
    ) from error

  pipeline.enable_attention_slicing()

  if hasattr(pipeline, 'vae') and hasattr(pipeline.vae, 'enable_slicing'):
    pipeline.vae.enable_slicing()

  pipeline.to(device)

  image = pipeline(
    prompt=args.prompt,
    guidance_scale=0.0,
    num_inference_steps=args.steps,
    width=args.width,
    height=args.height,
    max_sequence_length=256,
  ).images[0]

  image.save(output_path, format='PNG')

  payload = {
    'output_path': str(output_path),
    'model_id': args.model_id,
    'device': device,
    'duration_ms': round((time.perf_counter() - started_at) * 1000),
    'width': args.width,
    'height': args.height,
  }

  print(json.dumps(payload))


if __name__ == '__main__':
  main()
