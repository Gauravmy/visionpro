# Model weights

The default detector is `qc-yoloe.pt`: an Ultralytics **YOLOE-11l** model whose classes are
text prompts, reference-photo prompts and distractors (see `references/references.json`).
There is no training run. `vocabulary.json` (generated) maps every model class to the product
key the service reports; anything not listed is dropped.

Build or rebuild it (needs `pip install -r requirements-model.txt` plus PyTorch):

```bash
cd inference
python -c "from ultralytics import YOLOE; YOLOE('yoloe-11l-seg.pt')"   # downloads the base model once
mv yoloe-11l-seg.pt weights/
python -m tools.build_qc_model
```

To make detection better for **your** products, add a few photos of them to `references/`,
list them with their boxes in `references/references.json`, rebuild, and restart the service.
Two to five photos per item from the camera you inspect with help the most.

`qc-yoloe.pt` is stored with **Git LFS** (`git lfs pull` after cloning); the base model
`yoloe-11l-seg.pt` and the MobileCLIP text encoder are not committed (Ultralytics downloads them). Point `VI_MODEL_PATH` at other Ultralytics weights to use a
different model; the web app compares its id with the product profile's model.
