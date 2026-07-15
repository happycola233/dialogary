# -*- coding: utf-8 -*-
"""chatlog-md/1 参考解析器: 把 *.chat.md 解析为 JSON。

用法: python chatlog_parse.py 聊天记录.chat.md [-o out.json]
不带 -o 时只打印统计信息(用于校验)。
"""
import argparse
import json
import re
import sys
from pathlib import Path

SESSION_RE = re.compile(r'^#\s+@(\d{4}-\d{2}-\d{2})(?:\s*·\s*(.+?))?\s*$')
MSG_RE = re.compile(r'^##\s+(?:[^@\r\n]*?)@(user|ai|system)((?:\s*·\s*[^·\r\n]+)*)\s*$')
TS_RE = re.compile(r'^\d{4}-\d{2}-\d{2}( \d{2}:\d{2}(:\d{2})?)?$')
META_RE = re.compile(r'^<!--\s*@meta\s+(.*?)\s*-->\s*$')
META_KV_RE = re.compile(r'(\w+)=("([^"]*)"|\S+)')
THINK_RE = re.compile(r'^>\s*🤔\s*(.*)$')
ATTACH_LINK_RE = re.compile(r'^(🖼️|📄)\s+\[([^\]]+)\]\((.*)\)\s*$')
ATTACH_NAME_RE = re.compile(r'^(🖼️|📄)\s+(\S.*?)\s*$')
ESCAPED_RE = re.compile(r'^\\(#{1,2}\s|>\s*🤔|🖼️ |📄 )')


def parse_front_matter(lines, i):
    meta = {}
    if i < len(lines) and lines[i].strip() == "---":
        i += 1
        while i < len(lines) and lines[i].strip() != "---":
            ln = lines[i].strip()
            if ln and ":" in ln and not ln.startswith("#"):
                k, _, v = ln.partition(":")
                meta[k.strip()] = v.strip()
            i += 1
        i += 1  # 跳过结尾 ---
    return meta, i


def parse_kv(s):
    return {m.group(1): (m.group(3) if m.group(3) is not None else m.group(2))
            for m in META_KV_RE.finditer(s)}


def parse_header_fields(rest):
    """消息头 @角色 之后的字段: 按形状识别时间/模型。"""
    time = model = None
    for tok in rest.split("·"):
        tok = tok.strip()
        if not tok:
            continue
        if TS_RE.match(tok):
            if time is not None:
                raise ValueError(f"消息头出现两个时间戳: {rest!r}")
            time = tok
        else:
            if model is not None:
                raise ValueError(f"消息头出现两个模型字段: {rest!r}")
            model = tok
    return time, model


def finalize(msg):
    """后处理: 去首尾空行, 剥离思考块/附件, 还原转义。"""
    lines = msg.pop("body_lines")
    while lines and not lines[0].strip():
        lines.pop(0)
    while lines and not lines[-1].strip():
        lines.pop()

    # 思考块: 必须是正文第一个块
    msg["thinking"] = None
    if lines:
        tm = THINK_RE.match(lines[0])
        if tm:
            j = 1
            while j < len(lines) and lines[j].startswith(">"):
                j += 1
            think = [ln[1:].lstrip() if ln != ">" else "" for ln in lines[1:j]]
            msg["thinking"] = {"label": tm.group(1).strip(),
                               "text": "\n".join(think).strip("\n")}
            lines = lines[j:]
            while lines and not lines[0].strip():
                lines.pop(0)

    # 附件行(可选紧随一行 @meta 附着到该附件)
    msg["attachments"] = []
    kept = []
    k = 0
    while k < len(lines):
        lm = ATTACH_LINK_RE.match(lines[k])
        nm = None if lm else ATTACH_NAME_RE.match(lines[k])
        if lm or nm:
            m2 = lm or nm
            att = {"kind": "image" if m2.group(1) == "🖼️" else "file",
                   "name": m2.group(2),
                   "path": (lm.group(3) or None) if lm else None,
                   "meta": {}}
            if k + 1 < len(lines):
                am = META_RE.match(lines[k + 1])
                if am:
                    att["meta"].update(parse_kv(am.group(1)))
                    k += 1
            msg["attachments"].append(att)
        else:
            kept.append(ESCAPED_RE.sub(lambda m: m.group(0)[1:], lines[k]))
        k += 1
    msg["content"] = "\n".join(kept).strip("\n")

    t = msg["time"]
    msg["time_precision"] = (None if not t else
                             "day" if len(t) == 10 else
                             "minute" if len(t) == 16 else "second")
    return msg


def parse(path):
    lines = Path(path).read_text(encoding="utf-8-sig").split("\n")
    meta, i = parse_front_matter(lines, 0)
    doc = {"format": meta.pop("format", None), "meta": meta, "sessions": []}
    cur_session = None
    cur_msg = None
    last_obj = None  # @meta 附着目标

    def close_msg():
        nonlocal cur_msg
        if cur_msg is not None:
            cur_session["messages"].append(finalize(cur_msg))
            cur_msg = None

    def ensure_session(date=None, title=None):
        nonlocal cur_session
        cur_session = {"date": date, "title": title, "meta": {}, "messages": []}
        doc["sessions"].append(cur_session)

    while i < len(lines):
        ln = lines[i]
        sm = SESSION_RE.match(ln)
        mm = MSG_RE.match(ln)
        km = META_RE.match(ln)
        if sm:
            close_msg()
            ensure_session(sm.group(1), sm.group(2))
            last_obj = cur_session
        elif mm:
            close_msg()
            if cur_session is None:
                ensure_session()  # 隐式 session
            time, model = parse_header_fields(mm.group(2))
            cur_msg = {"role": mm.group(1), "time": time, "model": model,
                       "meta": {}, "body_lines": []}
            last_obj = cur_msg
        elif km and cur_msg is None or (km and not cur_msg["body_lines"]):
            (last_obj or doc)["meta"].update(parse_kv(km.group(1)))
        elif cur_msg is not None:
            cur_msg["body_lines"].append(ln)
        elif ln.strip():
            print(f"[warn] 行{i+1}: 游离于任何消息之外的内容: {ln[:50]!r}",
                  file=sys.stderr)
        i += 1
    close_msg()
    return doc


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("file")
    ap.add_argument("-o", "--out")
    a = ap.parse_args()
    doc = parse(a.file)

    msgs = [m for s in doc["sessions"] for m in s["messages"]]
    by_role = {}
    for m in msgs:
        by_role[m["role"]] = by_role.get(m["role"], 0) + 1
    prec = {}
    for m in msgs:
        prec[m["time_precision"]] = prec.get(m["time_precision"], 0) + 1
    print(f"sessions={len(doc['sessions'])} messages={len(msgs)} roles={by_role}")
    print(f"time_precision={prec}")
    print(f"model={sum(1 for m in msgs if m['model'])} "
          f"thinking={sum(1 for m in msgs if m['thinking'])} "
          f"attachments={sum(len(m['attachments']) for m in msgs)}")
    if a.out:
        Path(a.out).write_text(json.dumps(doc, ensure_ascii=False, indent=1),
                               encoding="utf-8")
        print(f"JSON -> {a.out}")


if __name__ == "__main__":
    main()
