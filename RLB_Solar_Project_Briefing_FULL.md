# RLB Solar Solutions — Project Briefing Document
*Last updated: June 29, 2026 | Bring this file into any new AI session to restore full context*

---

## HOW TO USE THIS FILE

Upload or paste this document at the start of any new Claude session and say:
**"Read this briefing file and pick up where we left off on the RLB Solar Solutions grant project."**

---

## 1. THE PEOPLE

**Randy Barclay** — Sole owner and Managing Member
- 40+ years precision manufacturing, CNC programming/machining (5-axis), ISO 9001 environments
- Oil/gas field background — directly relevant to remote work-site power market
- Currently employed full-time as machine shop manager at RMFI (Sunnyvale, CA)
- Planning to relocate to Idaho for RLB Solar operations
- Self-funded ~$50,000 into the patent and prototype development
- Email for RLB Solar business: rlbsolarsolutionsllc@gmail.com

**Samuel Anthony Dottle** (Sonora, CA) — Co-inventor, no ownership stake
- Named on patent out of respect; was paid for his design/electronics contribution
- Patent attorney structured the filing so Randy is sole owner (assignment handled at filing)
- No role in the business going forward — no equity, no grant paperwork needed from him

---

## 2. THE PATENT

**US Patent No. 11,677,350 B2**
- Title: "Solar Panel Tilt Adjustment System"
- Filed: December 19, 2020 (priority to provisional filed December 20, 2019)
- Issued: June 13, 2023
- Expiration: Approximately December 2040
- Inventors: Randy Barclay, Samuel Anthony Dottle
- Owner: Randy Barclay (sole; assignment confirmed by patent attorney at filing)
- Claims: 9 total

**What it covers:**
- Two independently motor-driven scissor-type lift jacks per solar panel
- Each jack has its own motor — raising one side more than the other enables true two-axis tilt (not just single-axis like existing products)
- Extremely low profile when stowed (~2 inches above roof level)
- Microcontroller + relay control architecture with light sensors for automatic sun-tracking ("Auto" mode)
- Scales to up to 6 panels per controller (FIG. 14)
- Remote operation capability

**What makes it novel over prior art:**
- Existing products: manual tilt legs (single-axis, must climb on roof)
- This patent: dual independently-actuated jacks = true multi-directional tilt, automated, low-profile, remote-controlled

**IP gaps to address (action items):**
- Confirm USPTO assignment search shows Sam's assignment to Randy recorded (Patent Center / assignment.uspto.gov) — if not recorded, file the existing signed assignment (~$25-40)
- No Freedom-to-Operate (FTO) analysis conducted yet
- No trademarks filed
- Single patent family — continuation applications for modernized electronics/tracking architecture would strengthen position

---

## 3. THE COMPANY

**RLB Solar Solutions LLC**
- Status: NOT YET FORMED as of June 29, 2026 — LLC formation is Immediate Action Item #1
- Structure: Single-member LLC (Randy is sole owner)
- Location: Idaho (where operations will be based)
- Stage: Pre-revenue; patent issued; original prototype built but uses outdated components

**Formation steps needed:**
1. File Articles of Organization with Idaho Secretary of State (~$100-150, done online at sos.idaho.gov)
2. Get EIN from IRS (free, 10 minutes at irs.gov)
3. Open business bank account
4. Formally assign patent rights from Randy Barclay (individual) to RLB Solar Solutions LLC

**Important:** Do NOT convert to C-corp yet. Single-member LLC is correct for now. C-corp conversion only needed if pursuing institutional VC or equity-based angel investment later.

---

## 4. THE TECHNOLOGY STRATEGY

**Original prototype — field-tested, 5+ years real-world use:**
- Mechanical switching
- Remote-control operation
- Dual-direction tilt capability
- Survived highway transport (CA-OR-ID routes), high wind, long-term outdoor exposure
- Key components: 80/20 aluminum extrusion (structural), Hayden motors (actuators), Victron charge controller integration
- Compatible with domestic solar panels including First Solar modules

**Next-generation upgrade plan:**
- GPS-based solar positioning using astronomical algorithms (open-loop primary tracking)
- Light sensor array for fine-correction trim (hybrid approach — NOT pure sensor tracking)
- Modern microcontroller architecture (ESP32/Teensy-class, industrial grade)
- Position encoders and limit switches
- Telemetry and data collection (cellular/LoRa)
- Automatic stow mode (wind/transport safety)
- Single-axis tracking first (tilt axis oriented N-S at deployment = captures daily E-W sun sweep)
- Dual-axis (azimuth rotation via slewing bearing) as future second-generation variant — NOT first priority

**Why single-axis first:**
- Single-axis captures ~65-75% of total possible tracking gain over fixed
- Dual-axis adds remaining 25-35% but requires slewing ring bearing, slip rings/cable-wrap, second motor, second locking system, added height — too complex for first product
- Start simple, generate field data, add azimuth rotation in Phase II

**Tracking technology decision (confirmed):**
- GPS/astronomical open-loop = primary control (reliable, weather-independent, no exposed sensors to dirty)
- Light sensor trim = secondary correction layer
- Fall back to pure astronomical if sensors dirty/clouded — graceful degradation
- This is the architecture used by top-performing hybrid systems in research

---

## 5. THE COMMERCIAL POSITIONING

**Critical positioning decision:** This is NOT an RV accessory.

**Official positioning:**
> "A Mobile Autonomous Solar Positioning Platform (MASPP) — a low-profile, highway-survivable, dual-axis solar tracker for any transportable power asset that currently relies on diesel generators or undersized fixed solar."

**The RV use is the proof point, not the market.** Multi-year highway survival data (CA-OR-ID driving) is field validation that B2B/industrial buyers require but rarely see from competitors.

**Top target markets (ranked by priority):**

**PRIMARY MARKETS FOR DOE SBIR PROPOSAL (emphasize these):**

| Rank | Market | Why |
|------|--------|-----|
| 1 | SAR (Search & Rescue) command trailers — western states | Direct DOE/emergency-resilience alignment; Randy has field background relevant here |
| 2 | Oil & gas remote field offices / wellsite power | Randy's oil/gas background = credibility; high diesel delivery cost; high ability to pay |
| 3 | Emergency response / disaster relief trailers | $1.3B → $3.9B market; FEMA/DOE grant alignment; life-safety urgency |
| 4 | Mobile communications trailers (COW/COLT) | Telecom diesel generator market ~$1.5-2.5B; fuel logistics pain |
| 5 | Remote environmental monitoring stations | USGS, EPA, state agencies; eliminate battery-swap site visits |
| 6 | Security & surveillance trailers | Generator refueling pain; licensing potential |
| 7 | Utility service & distribution trailers | DOE grid resilience funding direct fit |
| 8 | Construction site trailers | Large market; moderate urgency |
| 9 | Agricultural remote power | USDA REAP grants; price-sensitive |
| 10 | Event/production mobile power | Quick pilot potential; limited grant fit |

**Why tracking beats adding more panels (for every market):**
- These platforms have FIXED roof/deck area and weight budgets already at or near limits
- Tracking extracts more energy from the fixed footprint — "add another panel" is usually physically impossible

**Gap this fills (say this to reviewers):**
- Utility-scale trackers: permanent, ground-mounted, heavy, never transported, not height-constrained
- RV/consumer trackers: cheap, consumer-grade, not built for B2B/industrial durability
- This platform: transportable, road-legal, highway-survivable, unattended-capable, industrial-grade — **this gap is currently unoccupied**

**CRITICAL FRAMING SHIFT (discovered June 29, 2026):**
Because DOE SBIR management moved to the Office of Technology Commercialization (OTC) and EERE/SETO budgets were cut 74%, do NOT frame this as a "solar energy" project. Frame it as an **"energy systems / distributed resilient power"** project. The technology is a control and positioning system that maximizes energy extraction from any existing solar installation — not a solar panel product. This framing is better aligned with 2026 DOE priority areas and also makes it more defensible to OTC reviewers who want commercialization pathways, not pure R&D.

---

## 6. THE GRANTS

### AFWERX (Air Force) — DROPPED

**AFWERX decision (confirmed June 2026):** AFWERX Open Topic requires finding an Air Force unit willing to sign a memorandum as your "champion" within a short window. Without existing defense relationships or a defense-specific track record, this is low-probability. Dropped as a near-term target. Revisit after DOE win or commercial traction.

---

### Grant 1 — DOE SBIR Phase I (PRIMARY TARGET)

| Detail | Info |
|--------|------|
| Agency | Department of Energy (DOE) — now managed by Office of Technology Commercialization (OTC) |
| Program office | Solar Energy Technologies Office (SETO) — but budget-constrained in 2026 (see warning below) |
| Amount | ~$200-225K (realistic target; cap is ~$295K but don't budget to cap) |
| Duration | 6-12 months |
| Portal | energy.gov/technologycommercialization (OTC took over from sbir.energy.gov) |
| Timeline | FOA expected summer/August 2026 — **NOT confirmed yet as of June 29, 2026** |
| Status | LLC + EIN + SAM.gov registration must be complete BEFORE applying |

**IMPORTANT — DOE SBIR STATUS AS OF JUNE 29, 2026:**

Several significant changes happened since earlier sessions:

1. **SBIR program reauthorized.** S. 3971 signed April 13, 2026 — extends SBIR/STTR through September 2031. The program is alive.

2. **DOE FY2026 Release 1 was indefinitely postponed.** A Release 1 FOA was expected earlier in 2026, went from "slightly delayed" to indefinitely postponed. The reason is connected to the budget cuts below.

3. **EERE (which contains SETO) took a 74% budget cut.** FY2026 DOE budget cut EERE from $3.46 billion to $888 million. Solar, wind, and hydrogen deployment programs were explicitly eliminated. SETO-specific SBIR topics are significantly thinner this cycle.

4. **DOE SBIR management shifted to Office of Technology Commercialization (OTC).** No longer run out of individual program offices like SETO. Focus changed from "interesting science" to **commercialization-first**. This actually benefits Randy — 5 years of real field data, a patent, and named markets is exactly what OTC wants. Pure science proposals are at a disadvantage.

5. **2026 DOE priority areas are now:** AI, quantum computing, semiconductors, energy systems, and critical materials. "Energy systems" is where Randy's technology belongs — and this is the correct framing umbrella going forward.

6. **Phase I opportunity still expected "later in summer 2026"** but no FOA has dropped yet as of June 29. The August window in prior notes remains plausible but not confirmed.

**DOE evaluates on three criteria:**
1. Strength of scientific/technical approach (innovation claim must be clear in first 2 paragraphs)
2. Ability to carry out the project (team credentials, specific work plan with go/no-go milestones)
3. Impact (named potential customers, evidence of market demand — not just "big market" assertions)

**What reviewers actually care about (insider perspective):**
- Topic responsiveness: must directly address the specific topic they published
- Clear innovation statement: "existing systems do X, we do Y differently, Z is why it matters"
- PI track record: Randy's 40+ years manufacturing is relevant; frame it as "fabrication expertise directly reduces prototype risk"
- Realistic work plan: specific, testable milestones — not vague deliverables
- Commercialization credibility: any real customer conversations, LOIs, or named partners dramatically strengthen the application
- Post-SBIR pathway: clear path to Phase II and/or commercial licensing

**Current weak spots to fix before applying:**
1. No market validation yet (no customer conversations, no LOIs) — even 10-15 informal conversations documented as a simple survey helps
2. Financial projections not grounded in unit economics — need BOM cost + target retail price
3. "20-30% energy gain" claim should be framed as "hypothesis to validate in Phase I" not established fact (original prototype used outdated components; new system not yet built)
4. Manufacturing partner still informal — get even a non-binding LOI from an Idaho shop
5. Randy's full-time job at RMFI is a team capacity risk — address it head-on: "Founder will transition to full-time upon Phase I award"

**Draft working title:**
"Independently-Actuated Dual-Axis Solar Panel Tilt System with Automated Sun-Tracking for Mobile and Distributed Applications"

**Draft Phase I technical objectives (already written):**
1. Build and instrument 1-2 panel prototype on representative mobile platform
2. Quantify real-world energy gains vs. fixed-mount baseline across multi-day/seasonal test
3. Develop and refine automated sun-tracking algorithm (GPS/astronomical primary + light-sensor trim)
4. Characterize actuator and electronics durability under vibration, weather, mobile-use conditions

**Early warning system — ACTIVE:**
Randy subscribed to DOE SBIR/STTR mailing list at rlbsolarsolutionsllc@gmail.com on June 29, 2026.
Notifications selected:
- Just Announced Phase I and II Awards (competitive intelligence)
- Open Phase I Funding Opportunity Announcements ← **CRITICAL — will email the day the FOA drops**
- Topics Release Notifications
- SBIR/STTR Workshops and Conferences
- Program area selected: Clean Energy: Energy Efficiency and Renewable Energy

---

### Grant 2 — USDA REAP (Rural Energy for America Program) — WORTH EXPLORING

| Detail | Info |
|--------|------|
| Agency | USDA Rural Development |
| What it is | Reimbursement grants for renewable energy system installation — NOT competitive R&D |
| Why it fits | Randy's Idaho location qualifies as rural; could fund prototype deployment on a real-world site |
| Advantage | Far less competitive than SBIR; no R&D framing required; can be filed independently of LLC status complexity |
| Status | Needs research — not yet explored |

---

### Grant 3 — NSF SBIR (Alternative/Backup to DOE)

| Detail | Info |
|--------|------|
| Agency | National Science Foundation |
| Amount | Phase I: $305K (higher than DOE); Phase II: up to $2M |
| Advantage | Broader technology mandate; not dependent on SETO budget; "technology innovation" framing fits |
| Status | Not yet explored — viable backup if DOE SBIR solar topics don't open in 2026 |

---

### Grant 4 — AFWERX Open Topic SBIR (Air Force) — On Hold

| Detail | Info |
|--------|------|
| Agency | Air Force / AFWERX |
| Step 1 | afwerx.com/get-funded |
| Step 2 | afwerx.com/divisions/sbir-sttr/open-topic |
| Step 3 | dodsbirsttr.mil/submissions/login |
| Status | Dropped as near-term target — revisit after DOE win or commercial traction |
| Angle | Mobile expeditionary power; forward operating base energy resilience; diesel reduction for force protection |

---

## 7. RECOMMENDED BUDGET SCENARIOS

### If $100,000 available for prototype modernization:
- Mechanical upgrades (tilt platform, azimuth prototype, locking mechanisms): ~$30K
- Electronics (GPS, IMU, microcontroller, motor drivers, encoders, telemetry, enclosures): ~$18K
- Software (astronomical tracking algorithm, hybrid control logic, stow mode, telemetry dashboard): ~$15K (mostly labor)
- Testing (highway road test, third-party vibration/shock testing, environmental/IP, locking cycle test): ~$25K
- Data collection (multi-season field deployment, instrumentation, cloud telemetry): ~$12K

### If $250,000 available:
- Stage 1 (prototype modernization): $15-20K
- Remaining ~$230K: runway while pursuing SBIR Phase I application (~$45-55K/6mo survival) with rest in reserve

### If $500,000 available:
- Stage 1: $15-20K
- Stage 2 (self-fund Phase-I-equivalent R&D): ~$200-225K
- Stage 3 (6-month commercialization at realistic tier): ~$150-195K
- Reduced founder comp + one additional hire

---

## 8. IMMEDIATE ACTION ITEMS (IN ORDER)

### THIS WEEK (week of June 29, 2026):
1. **Form Idaho single-member LLC** — sos.idaho.gov, ~$100-150, takes 1-3 days. This is blocking everything else.
2. **Get EIN** — irs.gov, free, 10 minutes. Do this same day as LLC approval.
3. **Register SAM.gov** under new LLC EIN — allow 1-2 weeks processing; required for any federal award.
4. **Confirm patent assignment recorded** — search Patent Center (assignment.uspto.gov) for Patent 11,677,350; if Sam's assignment to Randy not recorded, file it now (~$25-40).

### NEXT 30-60 DAYS:
5. **Formally assign patent from Randy Barclay (individual) to RLB Solar Solutions LLC** — simple one-page assignment + USPTO recording.
6. **Build basic BOM cost model** — what does one unit cost in materials? What's the target retail price?
7. **Begin 10-15 informal customer conversations** — document them; even email exchanges count. Target: fleet operators, SAR coordinators, construction trailer rental companies, oil/gas field managers.
8. **Identify Idaho manufacturing partner** — even an informal LOI from a local machine shop strengthens both the SBIR proposal and economic development claims.
9. **Commission preliminary FTO review** with patent counsel.
10. **Research USDA REAP eligibility** for Idaho location — could fund prototype deployment independently of SBIR timeline.

### WHEN THE FOA DROPS (watch rlbsolarsolutionsllc@gmail.com):
11. **Submit Letter of Intent** within 3 weeks of FOA release.
12. **Submit full Phase I proposal** incorporating prototype progress and any field data.

---

## 9. CONTEXT ON THE SEPARATE RMFI BUSINESS (Randy's employer)

RMFI (Sunnyvale, CA) is a separate machine shop where Randy works as manager. There is a parallel set of initiatives being pursued there:

- **SAM.gov / defense subcontracting**: Register RMFI for DLA DIBBS, APEX Accelerators, to capture more government machining work
- **SBA 504**: Equipment financing for machine shop capital equipment
- **ETP (Employment Training Panel)**: California workforce training grants — relevant once new equipment is in place
- **Makerspace / trade education**: Partner with local community colleges on skilled trades pipeline; NSF ATE grants and Haas HTEC are potential funding sources; pitch to Peter (RMFI leadership)

These are tracked separately from RLB Solar Solutions. Do not confuse the two entities.

---

## 10. KEY RESEARCH COMPLETED (don't repeat these searches)

- Solar tracker technology comparison: light-sensor vs GPS/astronomical vs hybrid — hybrid with GPS primary wins for transportable/unattended platforms
- Single-axis vs dual-axis energy yield: single captures ~65-75% of total gain; second axis adds 25-35% (more at higher latitudes like Idaho); start with single-axis
- Top 10 commercial applications ranked by market size, pain, ability to pay, grant fit, pilot ease, licensing potential
- DOE SBIR review criteria and insider reviewer perspective (Robert Berger, former DOE SBIR Program Manager, wrote the book)
- AFWERX Open Topic SBIR: confirmed open, three-step filing process documented above
- Market sizes: Telecom diesel generator market ~$1.5-2.5B; Disaster relief mobile solar ~$1.3B→$3.9B
- Books recommended: "How to Prepare Winning Proposals for SBIR and STTR" by Robert Berger (DOE SBIR insider); "How the NIH Can Help You Get Funded" by Jeremy Berg (NIH director); "Having Success with NSF" by Ping Li & Karen Marrongelle (NSF program directors)
- Golden Dome / DARPA MANNUS contract (True Zero Technologies, June 26, 2026) — defense expeditionary manufacturing context — validates DOD interest in expeditionary autonomous energy systems
- **DOE SBIR FY2026 status (researched June 29, 2026):** EERE budget cut 74%; DOE SBIR management moved to OTC; FY2026 Release 1 indefinitely postponed; summer 2026 Phase I FOA still expected; priority areas shifted to AI/quantum/semiconductors/energy systems/critical materials; framing should be "energy systems" not "solar technology"
- **DOE mailing list subscription confirmed June 29, 2026** at rlbsolarsolutionsllc@gmail.com — all relevant notification types selected

---

## 11. WHAT WE HAVEN'T DONE YET (pick up here on Wednesday)

### Highest priority — proposal writing:
- [ ] Write full DOE SBIR Phase I proposal narrative — draft title and objectives already exist (see Section 6); needs full narrative written against OTC's commercialization-first criteria
- [ ] Reframe proposal language from "solar energy technology" to "distributed resilient energy systems" to align with 2026 DOE priorities
- [ ] Draft LOI text for DOE SBIR (due ~3 weeks after FOA release — needs to be ready to file fast)

### Research still needed:
- [ ] Research Idaho Department of Commerce specific programs (state-level grants, Idaho SBDC resources)
- [ ] Research USDA REAP eligibility for Randy's Idaho location
- [ ] Research NSF SBIR as a fallback if DOE solar topics don't materialize in 2026
- [ ] Identify specific AFWERX topics or challenges that match (expeditionary power, Indo-Pacific ops) — for future cycle

### Foundation work (blocking grant applications):
- [ ] LLC formation (blocking item — must be done first)
- [ ] EIN (same day as LLC)
- [ ] SAM.gov registration (takes 1-2 weeks after EIN)
- [ ] Patent assignment to LLC
- [ ] BOM cost model
- [ ] Customer conversation log (10-15 contacts minimum)
- [ ] Idaho manufacturing partner LOI

---

## 12. KEY CONTACTS & RESOURCES

| Resource | URL / Contact | Notes |
|----------|--------------|-------|
| DOE SBIR mailing list | Subscribed at rlbsolarsolutionsllc@gmail.com | Will alert when FOA drops |
| DOE SBIR portal | energy.gov/technologycommercialization | OTC took over management in 2026 |
| Idaho SOS (LLC filing) | sos.idaho.gov | ~$100-150, 1-3 day processing |
| IRS EIN | irs.gov/businesses/small-businesses-self-employed/apply-for-an-employer-identification-number-ein-online | Free, instant |
| SAM.gov | sam.gov | Register under LLC EIN; allow 1-2 weeks |
| USPTO Assignment Search | assignment.uspto.gov | Search Patent 11,677,350 to confirm Sam's assignment recorded |
| DOE SBIR email questions | solar.sbir@ee.doe.gov | Can ask program officer questions pre-FOA |

---

*End of briefing document. Version: June 29, 2026 — fully updated with session intelligence.*
