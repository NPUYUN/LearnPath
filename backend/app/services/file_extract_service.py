"""从常见文件格式提取纯文本。"""



from __future__ import annotations



import io

from pathlib import Path



TEXT_EXTENSIONS = {

    ".md",

    ".markdown",

    ".txt",

    ".csv",

    ".json",

    ".py",

    ".java",

    ".c",

    ".cpp",

    ".h",

    ".hpp",

    ".html",

    ".htm",

    ".xml",

    ".yaml",

    ".yml",

    ".rst",

    ".tex",

    ".sql",

    ".js",

    ".ts",

    ".tsx",

    ".jsx",

    ".go",

    ".rs",

    ".php",

    ".rb",

    ".swift",

    ".kt",

    ".log",

    ".ini",

    ".cfg",

}



BINARY_EXTENSIONS = {

    ".pdf",

    ".docx",

    ".doc",

    ".pptx",

    ".ppt",

    ".xlsx",

    ".xls",

    ".rtf",

}





def supported_extensions() -> list[str]:

    return sorted(TEXT_EXTENSIONS | BINARY_EXTENSIONS)





def _extract_pptx(data: bytes) -> str:

    from pptx import Presentation



    prs = Presentation(io.BytesIO(data))

    parts: list[str] = []

    for slide_idx, slide in enumerate(prs.slides, start=1):

        slide_texts: list[str] = []

        for shape in slide.shapes:

            if not hasattr(shape, "text"):

                continue

            text = (shape.text or "").strip()

            if text:

                slide_texts.append(text)

        if slide_texts:

            parts.append(f"【幻灯片 {slide_idx}】\n" + "\n".join(slide_texts))

    return "\n\n".join(parts).strip()





def _extract_xlsx(data: bytes) -> str:

    from openpyxl import load_workbook



    wb = load_workbook(io.BytesIO(data), read_only=True, data_only=True)

    parts: list[str] = []

    for sheet in wb.worksheets:

        rows: list[str] = []

        for row in sheet.iter_rows(max_row=500, values_only=True):

            cells = [str(c).strip() for c in row if c is not None and str(c).strip()]

            if cells:

                rows.append(" | ".join(cells))

        if rows:

            parts.append(f"【工作表 {sheet.title}】\n" + "\n".join(rows[:200]))

    wb.close()

    return "\n\n".join(parts).strip()





def extract_text_from_bytes(filename: str, data: bytes) -> str:

    ext = Path(filename).suffix.lower()

    if ext in TEXT_EXTENSIONS:

        for enc in ("utf-8", "utf-8-sig", "gbk", "latin-1"):

            try:

                return data.decode(enc)

            except UnicodeDecodeError:

                continue

        return data.decode("utf-8", errors="replace")



    if ext == ".pdf":

        try:

            from pypdf import PdfReader



            reader = PdfReader(io.BytesIO(data))

            parts = []

            for page in reader.pages:

                parts.append(page.extract_text() or "")

            return "\n\n".join(parts).strip()

        except Exception as e:

            raise ValueError(f"PDF 解析失败: {e}") from e



    if ext in {".docx", ".doc"}:

        if ext == ".doc":

            raise ValueError("旧版 .doc 请用 Word 另存为 .docx 后上传")

        try:

            from docx import Document



            doc = Document(io.BytesIO(data))

            return "\n".join(p.text for p in doc.paragraphs if p.text.strip())

        except Exception as e:

            raise ValueError(f"Word 解析失败: {e}") from e



    if ext in {".pptx", ".ppt"}:

        if ext == ".ppt":

            raise ValueError("旧版 .ppt 请用 PowerPoint 另存为 .pptx 后上传")

        try:

            text = _extract_pptx(data)

            if not text:

                raise ValueError("PPT 中未提取到文本（可能为纯图片幻灯片）")

            return text

        except ValueError:

            raise

        except Exception as e:

            raise ValueError(f"PPT 解析失败: {e}") from e



    if ext in {".xlsx", ".xls"}:

        if ext == ".xls":

            raise ValueError("旧版 .xls 请用 Excel 另存为 .xlsx 后上传")

        try:

            text = _extract_xlsx(data)

            if not text:

                raise ValueError("Excel 中未提取到有效单元格文本")

            return text

        except ValueError:

            raise

        except Exception as e:

            raise ValueError(f"Excel 解析失败: {e}") from e



    raise ValueError(f"不支持的文件类型: {ext or '(无扩展名)'}")





def guess_mime(filename: str) -> str:

    ext = Path(filename).suffix.lower()

    mapping = {

        ".pdf": "application/pdf",

        ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",

        ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",

        ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",

        ".md": "text/markdown",

        ".txt": "text/plain",

    }

    return mapping.get(ext, "application/octet-stream")

