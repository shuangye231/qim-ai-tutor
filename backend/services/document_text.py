import io
import xml.etree.ElementTree as ET
import zipfile
from pathlib import Path


MAX_DOCUMENT_SIZE = 10_000_000
SUPPORTED_SUFFIXES = {".md", ".txt", ".csv", ".docx", ".pptx", ".xlsx", ".pdf"}


class DocumentTextError(ValueError):
    pass


def extract_document_text(filename: str, content: bytes) -> str:
    suffix = Path(filename).suffix.lower()
    if suffix not in SUPPORTED_SUFFIXES:
        raise DocumentTextError("仅支持 Markdown、TXT、CSV、Word、PPTX、Excel XLSX 和 PDF 文件")
    if not content:
        raise DocumentTextError("上传的课件为空")
    if len(content) > MAX_DOCUMENT_SIZE:
        raise DocumentTextError("单个课件不能超过 10 MB")

    if suffix in {".md", ".txt", ".csv"}:
        for encoding in ("utf-8-sig", "utf-8", "gb18030"):
            try:
                text = content.decode(encoding)
                break
            except UnicodeDecodeError:
                continue
        else:
            raise DocumentTextError("无法识别课件编码，请转换为 UTF-8 后重试")
    elif suffix in {".docx", ".pptx", ".xlsx"}:
        try:
            with zipfile.ZipFile(io.BytesIO(content)) as archive:
                if suffix == ".docx":
                    names = ["word/document.xml"]
                elif suffix == ".pptx":
                    names = sorted(
                        name for name in archive.namelist()
                        if name.startswith("ppt/slides/slide") and name.endswith(".xml")
                    )
                else:
                    shared_strings = []
                    if "xl/sharedStrings.xml" in archive.namelist():
                        shared_root = ET.fromstring(archive.read("xl/sharedStrings.xml"))
                        shared_strings = [
                            "".join(node.text or "" for node in item.iter() if node.tag.endswith("}t"))
                            for item in shared_root.iter()
                            if item.tag.endswith("}si")
                        ]
                    names = sorted(
                        name for name in archive.namelist()
                        if name.startswith("xl/worksheets/sheet") and name.endswith(".xml")
                    )
                parts = []
                for name in names:
                    root = ET.fromstring(archive.read(name))
                    if suffix != ".xlsx":
                        parts.extend(node.text for node in root.iter() if node.tag.endswith("}t") and node.text)
                        continue
                    for cell in root.iter():
                        if not cell.tag.endswith("}c"):
                            continue
                        value = next((node.text for node in cell if node.tag.endswith("}v") and node.text is not None), None)
                        if value is None:
                            value = "".join(node.text or "" for node in cell.iter() if node.tag.endswith("}t")) or None
                        if value is not None:
                            cell_type = cell.attrib.get("t")
                            if cell_type == "s" and value.isdigit() and int(value) < len(shared_strings):
                                value = shared_strings[int(value)]
                            parts.append(value)
                text = "\n".join(parts)
        except (KeyError, zipfile.BadZipFile, ET.ParseError) as error:
            raise DocumentTextError("无法读取该 Office 课件，请确认文件没有损坏") from error
    else:
        try:
            import pdfplumber

            with pdfplumber.open(io.BytesIO(content)) as document:
                text = "\n".join(page.extract_text() or "" for page in document.pages)
        except ImportError as error:
            raise DocumentTextError("服务器尚未安装 PDF 解析组件 pdfplumber") from error
        except Exception as error:
            raise DocumentTextError("无法读取该 PDF，文件可能损坏或已加密") from error

    text = text.strip()
    if not text:
        raise DocumentTextError("课件中没有可提取文字；扫描版 PDF 暂不支持，请先进行 OCR")
    return text
