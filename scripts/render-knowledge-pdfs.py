#!/usr/bin/env python3
"""Regenerate public PDFs from Markdown files in the current directory.
Install dependency: python -m pip install reportlab
Usage: python scripts/render-knowledge-pdfs.py docs/africalatency-public-marketing-pack.md output.pdf
This script is public-safe and contains no credentials or private data.
"""
import re, sys
from pathlib import Path
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle

def main():
    if len(sys.argv) != 3:
        raise SystemExit("usage: render-knowledge-pdfs.py input.md output.pdf")
    source, target = map(Path, sys.argv[1:])
    styles = getSampleStyleSheet()
    styles.add(ParagraphStyle(name="H1Custom", parent=styles["Heading1"], fontSize=15, leading=19, textColor=colors.HexColor("#17324D"), spaceBefore=11))
    styles.add(ParagraphStyle(name="H2Custom", parent=styles["Heading2"], fontSize=11, leading=14, textColor=colors.HexColor("#24516F"), spaceBefore=8))
    styles.add(ParagraphStyle(name="BodyCustom", parent=styles["BodyText"], fontSize=9.5, leading=13, spaceAfter=4))
    styles.add(ParagraphStyle(name="CellCustom", parent=styles["BodyText"], fontSize=8, leading=10))
    story, table_rows = [], []
    def flush():
        nonlocal table_rows
        if table_rows:
            n=max(map(len,table_rows)); rows=[r+[""]*(n-len(r)) for r in table_rows]
            data=[[Paragraph(c.replace("`","").replace("**",""),styles["CellCustom"]) for c in row] for row in rows]
            t=Table(data,colWidths=[170*mm/n]*n,repeatRows=1)
            t.setStyle(TableStyle([("BACKGROUND",(0,0),(-1,0),colors.HexColor("#DCE6EF")),("GRID",(0,0),(-1,-1),.35,colors.HexColor("#AAB8C5")),("VALIGN",(0,0),(-1,-1),"TOP"),("LEFTPADDING",(0,0),(-1,-1),4),("RIGHTPADDING",(0,0),(-1,-1),4),("TOPPADDING",(0,0),(-1,-1),4),("BOTTOMPADDING",(0,0),(-1,-1),4)]))
            story.extend([t,Spacer(1,5)]); table_rows=[]
    for raw in source.read_text(encoding="utf-8").splitlines():
        line=raw.strip()
        if line.startswith("|"):
            cells=[x.strip() for x in line.strip("|").split("|")]
            if not all(re.fullmatch(r":?-{2,}:?",x or "-") for x in cells): table_rows.append(cells)
            continue
        flush()
        if not line: story.append(Spacer(1,3))
        elif line.startswith("# "): story.append(Paragraph(line[2:],styles["Title"]))
        elif line.startswith("## "): story.append(Paragraph(line[3:],styles["H1Custom"]))
        elif line.startswith("### "): story.append(Paragraph(line[4:],styles["H2Custom"]))
        elif line.startswith("- ") or re.match(r"^\\d+\\.\\s",line): story.append(Paragraph("• "+re.sub(r"^\\d+\\.\\s|^- ","",line).replace("`",""),styles["BodyCustom"]))
        else: story.append(Paragraph(line.replace("`","").replace("**",""),styles["BodyCustom"]))
    flush()
    def footer(canvas, doc):
        canvas.saveState(); canvas.setFont("Helvetica",8); canvas.setFillColor(colors.HexColor("#526170"))
        canvas.drawString(18*mm,10*mm,"AfricaLatency Public Reference")
        canvas.drawRightString(192*mm,10*mm,f"Page {doc.page} | 64bfc17e"); canvas.restoreState()
    SimpleDocTemplate(str(target),pagesize=A4,leftMargin=20*mm,rightMargin=20*mm,topMargin=18*mm,bottomMargin=18*mm).build(story,onFirstPage=footer,onLaterPages=footer)

if __name__ == "__main__": main()
