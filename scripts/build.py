"""Build the self-contained public site from source and verified upstream assets."""

import argparse
import base64
import gzip
import hashlib
import html
import io
import json
import tarfile
import urllib.request
import zipfile
from importlib.metadata import version
from pathlib import Path, PurePosixPath

from pptx import Presentation
from pptx.dml.color import RGBColor
from pptx.enum.text import MSO_ANCHOR, MSO_AUTO_SIZE, PP_ALIGN
from pptx.util import Pt

ROOT = Path(__file__).resolve().parents[1]
PDF_VERSION = "5.4.624"
ARCHIVE_NAME = f"pdfjs-dist-{PDF_VERSION}.tgz"
ARCHIVE_URL = f"https://registry.npmjs.org/pdfjs-dist/-/{ARCHIVE_NAME}"
SHA512 = "sm6TxKTtWv1Oh6n3C6J6a8odejb5uO4A4zo/2dgkHuC0iu8ZMAXOezEODkVaoVp8nX1Xzr+0WxFJJmUr45hQzg=="
MODULES = ("icons", "engine", "export", "brush", "viewport", "pdf", "slides", "batch", "app")
RESOURCE_DIRS = {"cmaps", "standard_fonts", "wasm", "iccs"}


def encoded(data):
    return base64.b64encode(data).decode("ascii")


def pdf_archive(local_archive):
    archive = local_archive or ROOT / ".cache" / ARCHIVE_NAME
    if archive.exists():
        data = archive.read_bytes()
    elif local_archive:
        raise FileNotFoundError(local_archive)
    else:
        with urllib.request.urlopen(ARCHIVE_URL, timeout=90) as response:
            data = response.read()
    if encoded(hashlib.sha512(data).digest()) != SHA512:
        raise ValueError("PDF.js archive failed SHA-512 verification")
    if not local_archive and not archive.exists():
        archive.parent.mkdir(exist_ok=True)
        archive.write_bytes(data)
    return data


def pdf_assets(data):
    assets = {}
    notices = {}
    with tarfile.open(fileobj=io.BytesIO(data), mode="r:gz") as archive:
        for item in sorted(archive, key=lambda entry: entry.name):
            if not item.isfile() or not item.name.startswith("package/"):
                continue
            path = PurePosixPath(item.name).relative_to("package")
            if path.name.startswith("LICENSE") and (len(path.parts) == 1 or path.parts[0] in RESOURCE_DIRS):
                notices[f"PDF.js · {path}"] = archive.extractfile(item).read().decode("utf-8")
            elif path.as_posix() in {"build/pdf.min.mjs", "build/pdf.worker.min.mjs"} or (
                len(path.parts) == 2 and path.parts[0] in RESOURCE_DIRS
            ):
                if path.name in assets:
                    raise ValueError(f"Duplicate PDF.js asset: {path.name}")
                original = archive.extractfile(item).read()
                buffer = io.BytesIO()
                with gzip.GzipFile(fileobj=buffer, mode="wb", compresslevel=6, mtime=0) as compressed:
                    compressed.write(original)
                assets[path.name] = encoded(buffer.getvalue())
    return assets, notices


def presentation_template():
    if version("python-pptx") != "1.0.2":
        raise RuntimeError("Install the version of python-pptx in requirements.txt")
    deck = Presentation()
    slide = deck.slides.add_slide(deck.slide_layouts[6])
    title = slide.shapes.add_textbox(Pt(6), Pt(4), Pt(360), Pt(26))
    title.name = "Figure title"
    frame = title.text_frame
    frame.margin_left = frame.margin_right = frame.margin_top = frame.margin_bottom = 0
    frame.auto_size = MSO_AUTO_SIZE.NONE
    frame.word_wrap = False
    frame.vertical_anchor = MSO_ANCHOR.MIDDLE
    paragraph = frame.paragraphs[0]
    paragraph.alignment = PP_ALIGN.LEFT
    run = paragraph.add_run()
    run.text = "Figure"
    run.font.name = "Arial"
    run.font.size = Pt(18)
    run.font.bold = True
    run.font.color.rgb = RGBColor.from_string("202020")
    deck.core_properties.title = "panel-extract"
    deck.core_properties.author = deck.core_properties.last_modified_by = "panel-extract"
    output = io.BytesIO()
    deck.save(output)
    with zipfile.ZipFile(output) as package:
        return {
            name: encoded(package.read(name))
            for name in sorted(package.namelist()) if name != "docProps/thumbnail.jpeg"
        }


def build(local_archive=None):
    src = ROOT / "src"
    page = (src / "page.html").read_text(encoding="utf-8")
    page = page.replace("<!--__ICON_SPRITE__-->", (src / "icons.svg").read_text(encoding="utf-8"))
    page = page.replace("/*__CSS__*/", (src / "style.css").read_text(encoding="utf-8"))
    for module in MODULES:
        marker = f"/*__{module.upper()}__*/"
        if page.count(marker) != 1:
            raise ValueError(f"Missing or repeated template marker {marker}")
        page = page.replace(marker, (src / f"{module}.js").read_text(encoding="utf-8"))
    assets, notices = pdf_assets(pdf_archive(local_archive))
    notices["python-pptx · MIT"] = (ROOT / "licenses/python-pptx-MIT.txt").read_text(encoding="utf-8")
    notices["Lucide · ISC / MIT"] = (ROOT / "licenses/lucide-ISC-MIT.txt").read_text(encoding="utf-8")
    license_html = "".join(
        f"<h3>{html.escape(name)}</h3><pre>{html.escape(notice)}</pre>" for name, notice in notices.items()
    )
    page = page.replace("__THIRD_PARTY_LICENSES__", license_html)
    page = page.replace("__PDF_ASSETS__", json.dumps(assets, separators=(",", ":")))
    page = page.replace("__PPT_PARTS__", json.dumps(presentation_template(), separators=(",", ":")))
    target = ROOT / "docs/index.html"
    target.parent.mkdir(exist_ok=True)
    target.write_text(page, encoding="utf-8", newline="\n")
    print(f"Built {target.name} ({target.stat().st_size:,} bytes)")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--pdfjs-archive", type=Path, help="Use an existing verified npm archive for an offline build.")
    build(parser.parse_args().pdfjs_archive)
