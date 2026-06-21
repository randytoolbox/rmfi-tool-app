from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.lib import colors
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable
from reportlab.lib.enums import TA_LEFT, TA_CENTER

doc = SimpleDocTemplate(
    "/home/user/rmfi-tool-app/RMFI-Robotics-Prospects.pdf",
    pagesize=letter,
    leftMargin=0.85*inch, rightMargin=0.85*inch,
    topMargin=0.9*inch, bottomMargin=0.9*inch,
)

DARK  = colors.HexColor('#0d1b2a')
BLUE  = colors.HexColor('#1565c0')
GOLD  = colors.HexColor('#f9a825')
MUTED = colors.HexColor('#546e7a')
WHITE = colors.white
LIGHT = colors.HexColor('#e3f2fd')

styles = getSampleStyleSheet()

def S(name, **kw):
    return ParagraphStyle(name, **kw)

title_style   = S('Title2',  fontSize=18, textColor=BLUE,  spaceAfter=4,  fontName='Helvetica-Bold', alignment=TA_CENTER)
sub_style     = S('Sub',     fontSize=10, textColor=MUTED, spaceAfter=12, fontName='Helvetica',      alignment=TA_CENTER)
h1_style      = S('H1',     fontSize=13, textColor=BLUE,  spaceBefore=14, spaceAfter=4, fontName='Helvetica-Bold')
h2_style      = S('H2',     fontSize=11, textColor=DARK,  spaceBefore=10, spaceAfter=3, fontName='Helvetica-Bold')
body_style    = S('Body2',  fontSize=9,  textColor=DARK,  spaceAfter=3,  fontName='Helvetica', leading=14)
bullet_style  = S('Bullet2',fontSize=9,  textColor=DARK,  spaceAfter=2,  fontName='Helvetica', leading=13, leftIndent=14, bulletIndent=4)
label_style   = S('Label',  fontSize=8,  textColor=MUTED, spaceAfter=1,  fontName='Helvetica-Bold')
callout_style = S('Callout',fontSize=9,  textColor=DARK,  spaceAfter=4,  fontName='Helvetica', leading=13, leftIndent=10, borderPad=6)

story = []

# ── Title block ───────────────────────────────────────────────────────────────
story.append(Paragraph("RMFI Manufacturing", title_style))
story.append(Paragraph("Humanoid Robot Industry — Contract Manufacturing Prospect List", sub_style))
story.append(Paragraph("Prepared: June 2026  |  Confidential — Internal Sales Use", sub_style))
story.append(HRFlowable(width="100%", thickness=2, color=BLUE, spaceAfter=10))

# ── Why Now ──────────────────────────────────────────────────────────────────
story.append(Paragraph("WHY THIS SECTOR — WHY NOW", h1_style))
story.append(Paragraph(
    "Humanoid robots crossed from R&amp;D into production in 2026. Figure AI's factory is producing "
    "one robot per hour. Boston Dynamics began shipping its electric Atlas. Tesla is targeting mass "
    "production of Optimus. Every one of these robots requires precision-machined joints, actuators, "
    "housings, frames, and structural components — the kind of work RMFI does.",
    body_style))
story.append(Paragraph(
    "The companies building their own machine shops are protecting proprietary core designs. "
    "Standard structural parts, enclosures, brackets, and non-proprietary components get outsourced. "
    "<b>That is the opening.</b>",
    body_style))
story.append(Spacer(1, 8))

# ── Tier 1 ────────────────────────────────────────────────────────────────────
story.append(HRFlowable(width="100%", thickness=1, color=BLUE, spaceAfter=4))
story.append(Paragraph("TIER 1 — IN PRODUCTION  (Highest Priority)", h1_style))

companies_t1 = [
    {
        "name": "1. Figure AI",
        "product": "Figure 02 / Figure 03 humanoid robot",
        "status": "BotQ factory at 1 robot/hour as of June 2026",
        "hq": "Sunnyvale, CA",
        "needs": "Precision machined aluminum/titanium joints, structural frames, motor housings",
        "note": "Backed by NVIDIA, Microsoft, Bezos; $39B valuation; BMW pilot underway",
        "contact": "figure.ai/contact",
    },
    {
        "name": "2. Boston Dynamics (Hyundai)",
        "product": "Electric Atlas humanoid; Spot quadruped",
        "status": "Shipping Atlas units to Hyundai plants and Google DeepMind (2026)",
        "hq": "Waltham, MA",
        "needs": "High-tolerance machined parts, actuator components, structural assemblies",
        "note": "Hyundai targeting 30,000 units/year by 2028 — volume is coming fast",
        "contact": "bostondynamics.com/company/contact",
    },
    {
        "name": "3. Tesla — Optimus Program",
        "product": "Optimus Gen 2 / Gen 3 humanoid robot",
        "status": "Autonomous operation in Tesla factories; Gen 3 targeting summer 2026",
        "hq": "Austin, TX / Fremont, CA",
        "needs": "Actuators, precision gearboxes, structural components",
        "note": "Musk projects Optimus could be Tesla's largest revenue source long-term",
        "contact": "tesla.com/supplier",
    },
    {
        "name": "4. Agility Robotics",
        "product": "Digit — first humanoid deployed commercially in warehouses",
        "status": "Running at Toyota facility (Canada) and Amazon warehouse pilots",
        "hq": "Albany, OR  |  Austin, TX (HQ)",
        "needs": "Precision leg/arm joints, titanium structural parts, custom fabrication",
        "note": "Robot-as-a-Service model means recurring fleet expansion orders",
        "contact": "agilityrobotics.com/contact",
    },
]

for c in companies_t1:
    story.append(Paragraph(c["name"], h2_style))
    data = [
        ["Product:", c["product"]],
        ["Status:", c["status"]],
        ["HQ:", c["hq"]],
        ["Needs from RMFI:", c["needs"]],
        ["Note:", c["note"]],
        ["Procurement:", c["contact"]],
    ]
    t = Table(data, colWidths=[1.1*inch, 5.4*inch])
    t.setStyle(TableStyle([
        ('FONTNAME',  (0,0), (0,-1), 'Helvetica-Bold'),
        ('FONTNAME',  (1,0), (1,-1), 'Helvetica'),
        ('FONTSIZE',  (0,0), (-1,-1), 8.5),
        ('TEXTCOLOR', (0,0), (0,-1), MUTED),
        ('TEXTCOLOR', (1,0), (1,-1), DARK),
        ('VALIGN',    (0,0), (-1,-1), 'TOP'),
        ('BOTTOMPADDING', (0,0), (-1,-1), 3),
        ('TOPPADDING',    (0,0), (-1,-1), 2),
    ]))
    story.append(t)
    story.append(Spacer(1, 6))

# ── Tier 2 ────────────────────────────────────────────────────────────────────
story.append(HRFlowable(width="100%", thickness=1, color=GOLD, spaceAfter=4))
story.append(Paragraph("TIER 2 — SCALING UP  (Near-Term Pipeline)", h1_style))

companies_t2 = [
    ("5. Apptronik", "Apollo humanoid", "Austin, TX", "GXO Logistics + NASA pilots", "apptronik.com/contact"),
    ("6. 1X Technologies", "NEO home / EVE industrial robot", "Sunnyvale, CA (US ops)", "Pre-orders open; manufacturing scale-up underway", "1x.tech/contact"),
    ("7. Sanctuary AI", "Phoenix humanoid", "Vancouver, BC", "Automotive and retail pilots", "sanctuary.ai/contact"),
]

data = [["Company", "Product", "HQ", "Status", "Contact"]]
for row in companies_t2:
    data.append(list(row))

t = Table(data, colWidths=[1.35*inch, 1.2*inch, 1.2*inch, 1.8*inch, 1.15*inch])
t.setStyle(TableStyle([
    ('BACKGROUND',  (0,0), (-1,0), BLUE),
    ('TEXTCOLOR',   (0,0), (-1,0), WHITE),
    ('FONTNAME',    (0,0), (-1,0), 'Helvetica-Bold'),
    ('FONTNAME',    (0,1), (-1,-1), 'Helvetica'),
    ('FONTSIZE',    (0,0), (-1,-1), 8),
    ('ROWBACKGROUNDS', (0,1), (-1,-1), [WHITE, LIGHT]),
    ('GRID',        (0,0), (-1,-1), 0.5, colors.HexColor('#b0bec5')),
    ('VALIGN',      (0,0), (-1,-1), 'TOP'),
    ('TOPPADDING',  (0,0), (-1,-1), 4),
    ('BOTTOMPADDING',(0,0),(-1,-1), 4),
]))
story.append(t)
story.append(Spacer(1, 10))

# ── Tier 3 Defense ────────────────────────────────────────────────────────────
story.append(HRFlowable(width="100%", thickness=1, color=colors.HexColor('#b71c1c'), spaceAfter=4))
story.append(Paragraph("TIER 3 — DEFENSE ROBOTICS  (US Manufacturing Required by Contract)", h1_style))
story.append(Paragraph(
    "Defense contracts require domestic manufacturing. This eliminates overseas competition and is a natural fit for US-certified machine shops.",
    body_style))
story.append(Spacer(1, 4))

defense = [
    ("8. Anduril Industries", "Autonomous defense systems, drones, robotic vehicles", "Costa Mesa, CA", "Active DoD contracts; Golden Dome partner", "anduril.com/contact"),
    ("9. Ghost Robotics", "Vision 60 quadruped (US Air Force, Army deployed)", "Philadelphia, PA", "Active military base deployments", "ghostrobotics.io/contact"),
    ("10. Sarcos Technology", "Guardian XO exoskeleton; Guardian DX robotic systems", "Salt Lake City, UT", "Industrial + defense deployments", "sarcos.com/contact"),
]

data = [["Company", "Product", "HQ", "Status", "Contact"]]
for row in defense:
    data.append(list(row))

t = Table(data, colWidths=[1.35*inch, 1.55*inch, 1.1*inch, 1.5*inch, 1.2*inch])
t.setStyle(TableStyle([
    ('BACKGROUND',  (0,0), (-1,0), colors.HexColor('#b71c1c')),
    ('TEXTCOLOR',   (0,0), (-1,0), WHITE),
    ('FONTNAME',    (0,0), (-1,0), 'Helvetica-Bold'),
    ('FONTNAME',    (0,1), (-1,-1), 'Helvetica'),
    ('FONTSIZE',    (0,0), (-1,-1), 8),
    ('ROWBACKGROUNDS', (0,1), (-1,-1), [WHITE, colors.HexColor('#ffebee')]),
    ('GRID',        (0,0), (-1,-1), 0.5, colors.HexColor('#b0bec5')),
    ('VALIGN',      (0,0), (-1,-1), 'TOP'),
    ('TOPPADDING',  (0,0), (-1,-1), 4),
    ('BOTTOMPADDING',(0,0),(-1,-1), 4),
]))
story.append(t)
story.append(Spacer(1, 10))

# ── Component makers ──────────────────────────────────────────────────────────
story.append(HRFlowable(width="100%", thickness=1, color=MUTED, spaceAfter=4))
story.append(Paragraph("COMPONENT / SUBSYSTEM MAKERS  (Supplier-to-Supplier Opportunities)", h1_style))
story.append(Paragraph(
    "These companies make parts that go INTO robots and often need outside machining for volume production.",
    body_style))
story.append(Spacer(1, 4))

components = [
    ("Harmonic Drive Systems", "Precision strain wave gearboxes (in every robot joint)", "Beverly, MA", "High-tolerance machined gearbox housings"),
    ("Symbotic (SYM)", "Warehouse automation robots", "Wilmington, MA", "Structural frames, enclosures at volume"),
    ("Teradyne / Universal Robots", "Collaborative robot arms", "N. Reading, MA", "Arm link machining, joint components"),
    ("Cognex (CGNX)", "Machine vision systems", "Natick, MA", "Precision housings for industrial cameras"),
]

data = [["Company", "What They Make", "HQ", "RMFI Opportunity"]]
for row in components:
    data.append(list(row))

t = Table(data, colWidths=[1.5*inch, 1.8*inch, 1.1*inch, 2.1*inch])
t.setStyle(TableStyle([
    ('BACKGROUND',  (0,0), (-1,0), MUTED),
    ('TEXTCOLOR',   (0,0), (-1,0), WHITE),
    ('FONTNAME',    (0,0), (-1,0), 'Helvetica-Bold'),
    ('FONTNAME',    (0,1), (-1,-1), 'Helvetica'),
    ('FONTSIZE',    (0,0), (-1,-1), 8),
    ('ROWBACKGROUNDS', (0,1), (-1,-1), [WHITE, colors.HexColor('#f5f5f5')]),
    ('GRID',        (0,0), (-1,-1), 0.5, colors.HexColor('#b0bec5')),
    ('VALIGN',      (0,0), (-1,-1), 'TOP'),
    ('TOPPADDING',  (0,0), (-1,-1), 4),
    ('BOTTOMPADDING',(0,0),(-1,-1), 4),
]))
story.append(t)
story.append(Spacer(1, 12))

# ── Sales talking points ──────────────────────────────────────────────────────
story.append(HRFlowable(width="100%", thickness=1, color=BLUE, spaceAfter=4))
story.append(Paragraph("WHAT TO LEAD WITH IN SALES CALLS", h1_style))

points = [
    ("<b>Tolerances you can hold</b> — robot joints require ±0.001\" or tighter on mating surfaces",
     "<b>Materials experience</b> — 6061/7075 aluminum, titanium 6Al-4V, 17-4 stainless are the common robot alloys"),
    ("<b>Prototype-to-production capability</b> — the shop that handles prototypes often gets the production order",
     "<b>Lead time</b> — robot companies are scaling quickly and hate supply chain delays"),
    ("<b>AS9100 / ISO 9001 certification</b> — defense robotics especially requires certified quality systems",
     "<b>US-based manufacturing</b> — defense contracts require it; eliminates overseas competitors"),
]

for left, right in points:
    data = [[Paragraph(left, bullet_style), Paragraph(right, bullet_style)]]
    t = Table(data, colWidths=[3.3*inch, 3.3*inch])
    t.setStyle(TableStyle([('VALIGN', (0,0), (-1,-1), 'TOP'), ('TOPPADDING', (0,0),(-1,-1), 2)]))
    story.append(t)

story.append(Spacer(1, 10))

# ── Bottom line ───────────────────────────────────────────────────────────────
story.append(HRFlowable(width="100%", thickness=2, color=GOLD, spaceAfter=6))
story.append(Paragraph("BOTTOM LINE", h1_style))
story.append(Paragraph(
    "The humanoid robot industry is at the same stage the EV industry was in 2018-2019 — past proof-of-concept, "
    "entering production scale-up, supply chain not yet locked in. The machine shops that get qualified NOW "
    "will be in the supply chain for the next decade. <b>The window to get on approved vendor lists before "
    "the big orders come is 2026–2027.</b>",
    body_style))

story.append(Spacer(1, 16))
story.append(Paragraph(
    "Research compiled June 2026. Company details subject to change — verify procurement contacts directly.",
    S('Footer', fontSize=7.5, textColor=MUTED, fontName='Helvetica', alignment=TA_CENTER)))

doc.build(story)
print("PDF created successfully.")
