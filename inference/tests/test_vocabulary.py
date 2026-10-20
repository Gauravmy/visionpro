import json

from app.detector import load_vocabulary


def test_maps_synonyms_and_keys_case_insensitively(tmp_path):
    path = tmp_path / "vocabulary.json"
    path.write_text(json.dumps({"classes": {"bottle": ["Glass Bottle", "flask"], "charger": []}}), encoding="utf-8")
    vocab = load_vocabulary(path)
    assert vocab == {"bottle": "bottle", "glass bottle": "bottle", "flask": "bottle", "charger": "charger"}


def test_missing_or_invalid_file_gives_empty_mapping(tmp_path):
    assert load_vocabulary(tmp_path / "absent.json") == {}
    bad = tmp_path / "bad.json"
    bad.write_text("{not json", encoding="utf-8")
    assert load_vocabulary(bad) == {}


def test_other_objects_map_to_out_of_range(tmp_path):
    path = tmp_path / "vocabulary.json"
    path.write_text(json.dumps({"classes": {"bottle": ["cup holder"]}, "other_objects": ["Cup", "cup holder"]}), encoding="utf-8")
    vocab = load_vocabulary(path)
    assert vocab["cup"] == "out_of_range"
    assert vocab["cup holder"] == "bottle"  # product synonyms win over other objects
