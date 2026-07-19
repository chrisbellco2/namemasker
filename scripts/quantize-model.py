#!/usr/bin/env python3
"""One-time int8 quantization of the vendored NER model.

Reproduces apps/site/static/model/distilbert-NER/onnx/model_int8.onnx from
the official fp32 export at dslim/distilbert-NER (onnx/model.onnx,
Apache-2.0). Settings mirror the transformers.js conversion defaults so the
artifact behaves like a stock *_int8 model.

Usage:
    python3 -m venv .venv && .venv/bin/pip install onnx onnxruntime
    .venv/bin/python scripts/quantize-model.py model.onnx model_int8.onnx
"""
import sys

from onnxruntime.quantization import QuantType, quantize_dynamic

src, dst = sys.argv[1], sys.argv[2]
quantize_dynamic(
    src,
    dst,
    weight_type=QuantType.QInt8,
    per_channel=True,
    reduce_range=True,
)
print(f'wrote {dst}')
