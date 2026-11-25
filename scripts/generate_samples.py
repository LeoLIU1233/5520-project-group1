"""Rebuild the fictional classroom PDFs. Run with reportlab available."""
from pathlib import Path
from reportlab.pdfgen import canvas
from reportlab.lib.colors import HexColor
from reportlab.lib.pagesizes import A4

OUT = Path(__file__).resolve().parents[1] / 'frontend' / 'public' / 'samples'
OUT.mkdir(parents=True, exist_ok=True)
W, H = A4

def certificate(filename, end_date):
    c = canvas.Canvas(str(OUT / filename), pagesize=A4)
    c.setTitle('Fictional internship certificate - FTEC5520 classroom sample')
    navy, teal, muted = map(HexColor, ['#173149', '#087f75', '#718194'])
    c.setFillColor(HexColor('#F8FAFC')); c.rect(0, 0, W, H, fill=1, stroke=0)
    c.setFillColor(teal); c.rect(0, H-15, W, 15, fill=1, stroke=0)
    c.setFillColor(navy); c.setFont('Helvetica-Bold', 14); c.drawString(54, H-75, 'NORTHSTAR')
    c.setFillColor(muted); c.setFont('Helvetica', 10); c.drawString(54, H-93, 'TRAINING & DEVELOPMENT')
    c.setFont('Helvetica', 8); c.drawRightString(W-54, H-75, 'FICTIONAL ORGANISATION')
    c.setFillColor(teal); c.setFont('Helvetica-Bold', 9); c.drawString(54, H-169, 'CERTIFICATE OF COMPLETION')
    c.setFillColor(navy); c.setFont('Helvetica-Bold', 29); c.drawString(54, H-213, 'Internship Certificate')
    c.setStrokeColor(HexColor('#DCE5EB')); c.line(54, H-241, W-54, H-241)
    c.setFillColor(muted); c.setFont('Helvetica', 11); c.drawString(54, H-285, 'This is to certify that')
    c.setFillColor(navy); c.setFont('Helvetica-Bold', 25); c.drawString(54, H-329, 'Alex Chan')
    c.setFillColor(muted); c.setFont('Helvetica', 11)
    c.drawString(54, H-360, 'has completed a fictional internship in the programme below.')
    rows = [('Programme', 'Applied Blockchain Research'), ('Organisation', 'Northstar Training'),
            ('Start date', '01 June 2026'), ('End date', end_date), ('Date of issue', '01 September 2026')]
    y = H-407
    for key, value in rows:
        c.setFillColor(muted); c.setFont('Helvetica', 10); c.drawString(54, y, key)
        c.setFillColor(navy); c.setFont('Helvetica-Bold', 11); c.drawString(207, y, value)
        y -= 32
    c.setFillColor(teal); c.setFont('Helvetica-Bold', 11); c.drawString(54, 181, 'Northstar Training')
    c.setFillColor(muted); c.setFont('Helvetica', 9); c.drawString(54, 163, 'Authorised training office - fictional signatory')
    c.setStrokeColor(HexColor('#DCE5EB')); c.line(54, 129, W-54, 129)
    c.setFillColor(muted); c.setFont('Helvetica', 8)
    c.drawString(54, 108, 'FTEC5520 classroom demonstration only. All names and details are fictional.')
    c.drawString(54, 94, 'This sample is not an actual qualification or proof of employment.')
    c.save()

certificate('certificate-original.pdf', '30 June 2026')
certificate('certificate-altered.pdf', '31 August 2026')
print('Generated two fictional certificate PDFs.')
