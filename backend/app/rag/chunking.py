from pathlib import Path


def chunk_markdown(text: str, *, chunk_size: int = 800, overlap: int = 120) -> list[str]:
    if len(text) <= chunk_size:
        return [text]
    chunks = []
    start = 0
    while start < len(text):
        end = start + chunk_size
        chunks.append(text[start:end])
        start = end - overlap
    return chunks


def split_text(text: str, *, chunk_size: int = 800, overlap: int = 120) -> list[str]:
    return chunk_markdown(text, chunk_size=chunk_size, overlap=overlap)


def load_markdown_files(base_dir: Path) -> list[dict]:
    documents = []
    chapters_dir = base_dir / "chapters"
    search_paths = list(chapters_dir.glob("*.md")) if chapters_dir.exists() else list(base_dir.glob("**/*.md"))
    for path in search_paths:
        if path.name.lower() == "readme.md":
            continue
        text = path.read_text(encoding="utf-8")
        meta = {"source": str(path), "title": path.stem, "chapter": path.stem}
        for i, chunk in enumerate(chunk_markdown(text)):
            documents.append(
                {
                    "id": f"{path.stem}_{i}",
                    "text": chunk,
                    "metadata": {**meta, "chunk_index": i},
                }
            )
    return documents
