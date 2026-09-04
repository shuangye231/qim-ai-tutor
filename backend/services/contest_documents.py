import io
import json
import re
import uuid
import xml.etree.ElementTree as ET
import zipfile
from pathlib import Path

MAX_DOCUMENT_SIZE = 10_000_000
SUPPORTED_SUFFIXES = {".docx", ".pdf", ".md", ".markdown", ".txt"}


class ContestDocumentError(ValueError):
    pass


def extract_document_text(filename: str, content: bytes) -> str:
    suffix = Path(filename).suffix.lower()
    if suffix not in SUPPORTED_SUFFIXES:
        raise ContestDocumentError("仅支持 Markdown、文本、Word 和 PDF 文档")
    if not content:
        raise ContestDocumentError("上传的文档为空")
    if len(content) > MAX_DOCUMENT_SIZE:
        raise ContestDocumentError("单个文档不能超过 10 MB")
    if suffix in {".md", ".markdown", ".txt"}:
        return content.decode("utf-8-sig", errors="replace").strip()
    if suffix == ".docx":
        try:
            with zipfile.ZipFile(io.BytesIO(content)) as archive:
                root = ET.fromstring(archive.read("word/document.xml"))
                paragraphs = []
                for paragraph in root.iter():
                    if paragraph.tag.endswith("}p"):
                        text = "".join(node.text or "" for node in paragraph.iter() if node.tag.endswith("}t"))
                        if text.strip():
                            paragraphs.append(text.strip())
                return "\n".join(paragraphs)
        except (KeyError, zipfile.BadZipFile, ET.ParseError) as error:
            raise ContestDocumentError("无法读取 Word 文档，请确认文件没有损坏") from error
    try:
        import pdfplumber
        with pdfplumber.open(io.BytesIO(content)) as document:
            text = "\n".join(page.extract_text() or "" for page in document.pages)
    except ImportError as error:
        raise ContestDocumentError("服务器尚未安装 PDF 解析组件 pdfplumber") from error
    except Exception as error:
        raise ContestDocumentError("无法读取 PDF，扫描版 PDF 请先进行 OCR") from error
    if not text.strip():
        raise ContestDocumentError("PDF 中没有可提取文字，扫描版 PDF 请先进行 OCR")
    return text.strip()


def _split_problem_blocks(text: str) -> list[str]:
    heading = re.compile(r"(?mi)^\s*(?:#{1,6}\s*)?(?:(?:第\s*)?[0-9一二三四五六七八九十百]+\s*[题、.)）:]|题目\s*[0-9一二三四五六七八九十百]+\s*[:：.)）]|(?:question|problem)\s*\d+\s*[:.)])\s*.*$")
    matches = list(heading.finditer(text))
    if not matches:
        return [text.strip()] if text.strip() else []
    return [text[m.start():(matches[i + 1].start() if i + 1 < len(matches) else len(text))].strip() for i, m in enumerate(matches)]


def _sections(block: str) -> tuple[str, dict[str, str]]:
    lines = [line.strip().lstrip("-*").strip() for line in block.replace("\r\n", "\n").split("\n") if line.strip()]
    heading = lines[0] if lines else "未命名题目"
    title = re.sub(r"^(?:#{1,6}\s*)?(?:(?:第\s*)?[0-9一二三四五六七八九十百]+\s*[题、.)）:]|题目\s*[0-9一二三四五六七八九十百]+\s*[:：.)）]|(?:question|problem)\s*\d+\s*[:.)])\s*", "", heading, flags=re.I).strip(" ：:、") or heading
    aliases = {
        "description": r"题目描述|题目说明|描述|description|problem",
        "input": r"输入格式|输入|input",
        "output": r"输出格式|输出|output",
        "sample_input": r"样例输入|示例输入|sample input|example input",
        "sample_output": r"样例输出|示例输出|sample output|example output",
        "points": r"分值|分数|points|score",
        "difficulty": r"难度|difficulty",
        "tags": r"知识点|标签|tags|topics",
        "type": r"题型|类型|type",
        "options": r"选项|options|答案选项",
        "answer": r"答案|正确答案|answer|correct answer",
    }
    field_pattern = "|".join(f"(?P<{key}>{value})" for key, value in aliases.items())
    sections: dict[str, list[str]] = {"description": []}
    active = "description"
    for line in lines[1:]:
        match = re.match(rf"^(?:#+\s*)?(?:{field_pattern})\s*[:：]?\s*(.*)$", line, flags=re.I)
        if match:
            active = next(key for key in aliases if match.group(key) is not None)
            sections.setdefault(active, [])
            rest = match.group(match.lastindex or 0) or ""
            if rest.strip(" ：:"):
                sections[active].append(rest.strip(" ：:"))
        else:
            sections.setdefault(active, []).append(line)
    return title[:120], {key: "\n".join(value).strip() for key, value in sections.items()}


def _pick(sections: dict[str, str], name: str, default: str = "") -> str:
    return sections.get(name) or default


def _question_type(sections: dict[str, str], block: str) -> str:
    declared = _pick(sections, "type").lower()
    if any(token in declared for token in ("选择", "choice", "option")):
        return "single_choice"
    if any(token in declared for token in ("判断", "true", "false")):
        return "true_false"
    if any(token in declared for token in ("编程", "程序", "programming", "coding")):
        return "programming"
    value = block[:300].lower()
    if any(token in value for token in ("判断题", "判断", "true or false", "true/false", "true false")):
        return "true_false"
    if any(token in value for token in ("选择题", "单选", "多选", "choice", "option")) or _pick(sections, "options"):
        return "single_choice"
    return "programming"


def _options(raw: str, block: str) -> list[dict[str, str]]:
    source = raw or "\n".join(line for line in block.splitlines() if re.match(r"^\s*[A-HＡ-Ｈ][.、)）:]", line))
    result = []
    for match in re.finditer(r"(?m)^\s*([A-HＡ-Ｈ])[.、)）:]\s*(.+)$", source):
        result.append({"key": match.group(1).upper(), "text": match.group(2).strip()[:500]})
    return result[:8]


def _legacy_exam_sections(text: str, language: str) -> list[dict] | None:
    """Parse Word-style exams whose paragraphs are grouped under numbered sections."""
    lines = [line.strip() for line in text.replace("\r\n", "\n").split("\n") if line.strip()]
    reference_index = next((i for i, line in enumerate(lines) if "参考答案" in line), len(lines))
    body = lines[:reference_index]
    section_re = re.compile(r"^[一二三四五六七八九十]+[、.．]\s*(选择题|判断题|填空题|编程题)")
    sections = [(i, match.group(1), line) for i, line in enumerate(body) if (match := section_re.match(line))]
    if len(sections) < 2:
        return None
    reference = "\n".join(lines[reference_index + 1:])
    choice_answers = re.findall(r"\d+\s*[.、]\s*([A-DＡ-Ｄ])", reference.split("二、判断题", 1)[0] if "二、判断题" in reference else reference)
    true_answers = [value in {"√", "对", "正确", "true", "T"} for value in re.findall(r"\d+\s*[.、]\s*([√×对错TF])", reference)]
    fill_reference = reference.split("三、填空题", 1)[1] if "三、填空题" in reference else ""
    fill_answers = [line for line in fill_reference.splitlines() if line.strip() and "四、编程题" not in line][:5]
    problems: list[dict] = []
    index = 1
    choice_no = true_no = 0
    for section_index, (start, kind_name, heading) in enumerate(sections):
        end = sections[section_index + 1][0] if section_index + 1 < len(sections) else len(body)
        items = body[start + 1:end]
        points_match = re.search(r"每题\s*(\d+)", heading)
        points = int(points_match.group(1)) if points_match else {"选择题": 5, "判断题": 4, "填空题": 3, "编程题": 15}[kind_name]
        kind = {"选择题": "single_choice", "判断题": "true_false", "填空题": "fill_blank", "简答题": "short_answer", "编程题": "programming"}[kind_name]
        if kind == "single_choice":
            for item in items:
                markers = list(re.finditer(r"([A-DＡ-Ｄ])[.、)）:：]\s*", item))
                if not markers:
                    continue
                title = item[:markers[0].start()].strip("（）() ") or f"第 {index} 题"
                options = []
                for marker_index, marker in enumerate(markers):
                    option_end = markers[marker_index + 1].start() if marker_index + 1 < len(markers) else len(item)
                    options.append({"key": marker.group(1).upper(), "text": item[marker.end():option_end].strip() or "（未填写）"})
                answer = choice_answers[choice_no] if choice_no < len(choice_answers) else ""
                problems.append({"title": title, "type": kind, "points": points, "description": title, "options": options, "correct_answer": answer})
                choice_no += 1
                index += 1
        elif kind == "true_false":
            for item in items:
                if not item or section_re.match(item):
                    continue
                answer = ("true" if true_answers[true_no] else "false") if true_no < len(true_answers) else ""
                problems.append({"title": item.rstrip("（）()"), "type": kind, "points": points, "description": item, "options": [], "correct_answer": answer})
                true_no += 1
                index += 1
        elif kind in {"fill_blank", "short_answer"}:
            for item_index, item in enumerate(items):
                if not item:
                    continue
                answer = fill_answers[item_index] if item_index < len(fill_answers) else ""
                problems.append({"title": item[:120], "type": kind, "points": points, "description": item, "options": [], "correct_answer": answer})
                index += 1
        else:
            description = "\n".join(items).strip()
            if description:
                problems.append({"title": "编写 Python 程序", "type": kind, "points": points, "description": description, "options": [], "correct_answer": ""})
                index += 1
    if not problems:
        return None
    normalized = []
    for item_index, item in enumerate(problems, 1):
        normalized.append({
            "id": uuid.uuid4().hex[:12], "code": f"T{item_index:04d}", "title": item["title"][:120], "type": item["type"], "language": language,
            "difficulty": "基础", "category": "教师自定义", "tags": ["教师出题"], "points": item["points"], "description": item["description"][:20_000],
            "input": "请按题目要求作答。", "output": "", "examples": [{"input": "", "output": ""}], "test_cases": [{"input": "", "output": ""}] if item["type"] == "programming" else [],
            "options": item["options"], "correct_answer": item["correct_answer"], "starterCode": "", "source": {"name": "机构教师", "license": "机构自有", "url": ""},
        })
    return normalized


def parse_contest_problems(text: str, language: str) -> list[dict]:
    normalized = re.sub(r"\n{3,}", "\n\n", text).strip()
    if len(normalized) < 8:
        raise ContestDocumentError("文档内容过少，未识别到可用题目")
    legacy = _legacy_exam_sections(normalized, language)
    if legacy:
        return legacy[:50]
    problems = []
    for index, block in enumerate(_split_problem_blocks(normalized), start=1):
        title, sections = _sections(block)
        kind = _question_type(sections, block)
        points_match = re.search(r"\d+", _pick(sections, "points", "20"))
        points = min(100, max(1, int(points_match.group()) if points_match else 20))
        difficulty = _pick(sections, "difficulty", "基础")
        if difficulty not in {"入门", "基础", "进阶", "挑战"}:
            difficulty = "基础"
        tags = [item.strip() for item in re.split(r"[,，、\s]+", _pick(sections, "tags")) if item.strip()]
        options = _options(_pick(sections, "options"), block) if kind == "single_choice" else []
        answer = _pick(sections, "answer", "")
        if kind == "true_false":
            answer = "" if not answer.strip() else ("true" if answer.lower() in {"true", "t", "正确", "对", "是"} else "false")
        problems.append({
            "id": uuid.uuid4().hex[:12], "code": f"T{index:04d}", "title": title or f"第 {index} 题",
            "type": kind, "language": language, "difficulty": difficulty,
            "category": tags[0] if tags else "教师自定义", "tags": tags[:6] or ["教师出题"], "points": points,
            "description": _pick(sections, "description", block)[:20_000], "input": _pick(sections, "input", "请按题目要求作答。")[:5_000],
            "output": _pick(sections, "output", "")[:5_000],
            "examples": [{"input": _pick(sections, "sample_input")[:5_000], "output": _pick(sections, "sample_output")[:5_000]}],
            "test_cases": [{"input": _pick(sections, "sample_input")[:5_000], "output": _pick(sections, "sample_output")[:5_000]}] if kind == "programming" else [],
            "options": options, "correct_answer": answer, "starterCode": "",
            "source": {"name": "机构教师", "license": "机构自有", "url": ""},
        })
    return problems[:50]


def parse_ai_contest_problems(content: str, language: str, expected_count: int | None = None) -> list[dict]:
    cleaned = re.sub(r"^```(?:json)?\s*|\s*```$", "", str(content or "").strip(), flags=re.IGNORECASE)
    try:
        payload = json.loads(cleaned)
    except json.JSONDecodeError:
        match = re.search(r"\{[\s\S]*\}|\[[\s\S]*\]", cleaned)
        if not match:
            raise ContestDocumentError("AI 没有返回可识别的试卷 JSON")
        try:
            payload = json.loads(match.group())
        except json.JSONDecodeError as error:
            raise ContestDocumentError("AI 返回的试卷格式不正确，请重新生成") from error
    raw_problems = payload.get("problems") if isinstance(payload, dict) else payload
    if not isinstance(raw_problems, list) or not 1 <= len(raw_problems) <= 50:
        raise ContestDocumentError("AI 返回的试卷必须包含 1 到 50 道题")
    if expected_count is not None and len(raw_problems) != expected_count:
        raise ContestDocumentError(f"AI 返回了 {len(raw_problems)} 道题，与要求的 {expected_count} 道不一致，请重新生成")

    type_names = {
        "选择题": "single_choice", "单选题": "single_choice", "single_choice": "single_choice", "choice": "single_choice",
        "判断题": "true_false", "true_false": "true_false", "判断": "true_false",
        "填空题": "fill_blank", "简答题": "short_answer", "fill_blank": "fill_blank", "short_answer": "short_answer",
        "编程题": "programming", "程序题": "programming", "programming": "programming", "coding": "programming",
    }
    problems = []
    for index, raw in enumerate(raw_problems, start=1):
        if not isinstance(raw, dict):
            raise ContestDocumentError(f"AI 返回的第 {index} 题格式不正确")
        kind = type_names.get(str(raw.get("type") or "").strip().lower())
        title = str(raw.get("title") or "").strip()
        description = str(raw.get("description") or raw.get("prompt") or "").strip()
        if not kind or not title or not description:
            raise ContestDocumentError(f"AI 返回的第 {index} 题缺少题型、标题或题目描述")
        raw_options = raw.get("options") or []
        if not isinstance(raw_options, list):
            raise ContestDocumentError(f"AI 返回的第 {index} 题选项格式不正确")
        options = []
        if kind == "single_choice":
            for option_index, option in enumerate(raw_options[:8]):
                if isinstance(option, dict):
                    key = str(option.get("key") or chr(65 + option_index)).strip().upper()[:2]
                    text = str(option.get("text") or option.get("value") or "").strip()[:500]
                else:
                    key, text = chr(65 + option_index), str(option).strip()[:500]
                if text:
                    options.append({"key": key, "text": text})
            if len(options) < 2:
                raise ContestDocumentError(f"AI 返回的第 {index} 道选择题缺少有效选项")
        raw_answer = raw.get("correct_answer", raw.get("answer", ""))
        if kind == "true_false":
            correct_answer = raw_answer if isinstance(raw_answer, bool) else ("" if not str(raw_answer).strip() else str(raw_answer).strip().lower() in {"true", "t", "1", "正确", "对", "是"})
        else:
            correct_answer = str(raw_answer or "").strip()[:500]
        if kind == "single_choice":
            correct_answer = correct_answer.upper()[:2]
            if correct_answer not in {option["key"] for option in options}:
                raise ContestDocumentError(f"AI 返回的第 {index} 道选择题答案不在选项中")
        if kind in {"fill_blank", "short_answer"} and not correct_answer:
            raise ContestDocumentError(f"AI 返回的第 {index} 道填空题缺少参考答案")
        raw_tests = raw.get("test_cases") or raw.get("tests") or []
        tests = [
            {"input": str(test.get("input") or "")[:8_000], "output": str(test.get("output") or "")[:8_000]}
            for test in raw_tests[:20] if isinstance(test, dict)
        ]
        if kind == "programming" and not tests:
            raise ContestDocumentError(f"AI 返回的第 {index} 道编程题缺少判题测试点")
        tags = raw.get("tags") or raw.get("knowledge_points") or []
        if isinstance(tags, str):
            tags = re.split(r"[,，、/\s]+", tags)
        if not isinstance(tags, list):
            tags = []
        difficulty = str(raw.get("difficulty") or "基础").strip()
        if difficulty not in {"入门", "基础", "进阶", "挑战"}:
            difficulty = "基础"
        sample = raw.get("example") or (tests[0] if tests else {})
        if not isinstance(sample, dict):
            sample = {}
        problems.append({
            "id": uuid.uuid4().hex[:12], "code": f"T{index:04d}", "title": title[:120], "type": kind,
            "language": language, "difficulty": difficulty, "category": str(tags[0])[:60] if tags else "教师自定义",
            "tags": [str(tag).strip()[:60] for tag in tags[:6] if str(tag).strip()] or ["教师出题"],
            "points": min(100, max(1, int(raw.get("points") or 20))), "description": description[:20_000],
            "input": str(raw.get("input") or "请按题目要求作答。")[:5_000], "output": str(raw.get("output") or "")[:5_000],
            "examples": [{"input": str(sample.get("input") or "")[:5_000], "output": str(sample.get("output") or "")[:5_000]}],
            "test_cases": tests if kind == "programming" else [], "options": options, "correct_answer": correct_answer,
            "starterCode": str(raw.get("starter_code") or raw.get("starterCode") or "")[:8_000],
            "source": {"name": "机构教师 AI 草稿", "license": "机构自有", "url": ""},
        })
    return problems
