# Climate-KIC Pilot Regional BOT: Product Requirements Document

**Version:** 1.0  
**Date:** January 29, 2026  
**Target Launch:** February 19, 2026 (3 weeks)  
**Audience:** Product Team, Engineering, Facilitators, Regional Stakeholders

---

## Executive Summary

Climate-KIC is building an **AI-powered interactive learning companion** designed to revolutionize capacity-building for regional climate transitions. The **Pilot Regional BOT** is a session-based, narrative-driven learning tool that helps regional authorities and stakeholders explore climate innovation strategies in a safe sandbox environment through role-play scenarios and systems thinking exercises.

**Core Value Proposition:**
- 🎮 **Safe experimentation space** for testing transition strategies without real-world consequences
- 🎭 **Narrative-driven experience** with rich stakeholder perspectives and conflict dynamics
- 💡 **Practical learning outcome** translating abstract concepts (Transformation Innovation Portfolios/Missions) into engaging, experiential learning
- 🔄 **Facilitator-led model** ensuring expert guidance maintains learning rigor

**MVP Scope:** Functional chat platform with room-based sessions, Onyx API integration, minimal fictional region knowledge base, and facilitator guide.

**Post-MVP:** Enhanced knowledge base, advanced scenario templates, analytics dashboard, scaling to multiple regions.

---

## 1. Product Vision & Context

### 1.1 The Problem

Regional authorities responsible for climate transitions face three critical gaps:

1. **Knowledge-Practice Gap:** Understanding frameworks like "Transformation Innovation Portfolios" is intellectually different from operationalizing them in complex regional systems.

2. **Stakeholder Complexity:** Regional transitions require balancing competing interests (farmers, businesses, municipalities, universities, NGOs). Decision-makers lack safe ways to test how choices impact each constituency.

3. **Learning from Failure:** Real-world climate implementation has high stakes and slow feedback loops. Authorities need rapid experimentation and reflection cycles.

### 1.2 Climate-KIC's Solution: Learning by Doing

Instead of classroom training on abstract concepts, Climate-KIC's BOT creates a **"learning sandbox"** where regional actors:

- **Explore a fictional region** with realistic climate vulnerabilities, economic sectors, governance structures, and stakeholder ecosystems
- **Make strategic decisions** (e.g., investing in forestry innovation, subsidy policies, public-private partnerships)
- **See stakeholder reactions** instantly (farmers respond to subsidies; universities create spin-outs; municipalities coordinate)
- **Reflect critically** on outcomes ("Who wins? Who loses? Is this equitable?")
- **Apply learnings** back to their real regional context

### 1.3 Why RPG/Game Design?

The BOT is **not a quiz or assessment tool.** It's a **narrative-driven RPG** because:

- **Player agency** drives learning: participants make choices, not answering predetermined questions
- **Conflict & complexity** create realistic pressure and stakes
- **Emergent narrative** reflects stakeholder dynamics and unintended consequences
- **Reflection prompts** invite normative thinking: ethics, equity, systemic impact

---

## 2. Core Product Concept

### 2.1 Session Model

**Duration:** 90-120 minutes per session (led by trained facilitator)

**Participants:** 1-4 regional authorities + 1 facilitator

**Format:**
1. **Introduction (15 min):** Fictional region briefing, learning objectives, scenario setup
2. **Gameplay (60-75 min):** Groups make strategic decisions; BOT responds as narrator + stakeholder characters
3. **Reflection (15-20 min):** Debrief on outcomes, learning insights, application to real context

**Availability:** BOT accessible ONLY during scheduled sessions (not for self-study)
- Rationale: Facilitator expertise is essential; unguided exploration dilutes learning rigor

### 2.2 Technical Foundation: Chat + Room Model

**Current Architecture (Baseline):**
- Next.js App Router (frontend + API routes)
- Server-side message storage (local file or in-memory in serverless)
- Onyx API integration (non-streamed server-side parsing; client receives full response)
- Room-based session management (create/join room)

**MVP Scope:**
- Fix reliability issues (timeout/retry, 404 polling, error handling)
- Persist messages durably (move from ephemeral to persistent storage)
- Add facilitator control panel (pause, switch narrative mode, inject challenges)
- Minimal fictional region knowledge base loaded into Onyx
- Session lifecycle management (start/pause/end with timestamp logging)

### 2.3 The Fictional Region

**Example: "Valleyholm" (temperate, mid-income EU region)**

- **Geography:** Alpine foothills, mixed agriculture + tourism + light manufacturing
- **Climate Challenge:** Shifting precipitation patterns, glacier retreat, wildfire risk
- **Economic Sectors:** 
  - Agriculture (dairy, wine, forestry)
  - Tourism (winter sports + hiking)
  - Manufacturing (precision engineering, food processing)
  - Universities (climate research institute)
- **Governance:** Regional authority + 7 municipalities, strong civil society
- **Key Stakeholders:**
  - Farmers Association
  - Chamber of Commerce
  - University (climate institute)
  - Tourism Board
  - Environmental NGO
  - Municipal Assembly
  - Youth Council

**BOT Personas:** The BOT responds as narrator but also **voices stakeholder perspectives** to show second-order effects of decisions.

---

## 3. User Personas & Use Cases

### 3.1 Primary User: Regional Managing Authority

**Who:** Climate transition officer, regional planner, mayor, or innovation manager

**Goals:**
- Understand how innovation portfolio thinking applies to real constraints
- Test assumptions about stakeholder responses to different policies
- Build confidence to facilitate transitions in their region
- Learn from peer experiences (networked sessions with other regions)

**Pain Points:**
- Limited time for experimentation (high-stakes real projects)
- Competing stakeholder interests hard to navigate
- Abstract frameworks don't translate to implementation
- Risk of "wrong" decisions with real consequences

**Session Behavior:**
- Asks facilitator strategic questions
- Makes deliberate decisions about which sector to focus on
- Reacts to stakeholder feedback (surprised, curious, defensive)
- Reflects on equity implications

### 3.2 Secondary User: Facilitator

**Who:** Climate-KIC trainer, regional development consultant, or expert practitioner

**Goals:**
- Guide learning outcomes without micromanaging decisions
- Introduce realistic complications and conflicts
- Prompt critical reflection on decisions
- Capture insights for report-back to Climate-KIC

**Pain Points:**
- Need clear scripts for introducing scenarios
- Must balance participant agency with learning rigor
- Need to track decision rationale for debrief
- Want to adapt on-the-fly based on participant engagement

**Session Behavior:**
- Starts the session with region briefing
- Monitors conversation; pauses to ask reflection questions
- Injects complications ("The farmers just announced strike")
- Ends session with structured debrief

### 3.3 Tertiary User: Climate-KIC Program Manager

**Who:** Program coordinator, regional lead, impact analyst

**Goals:**
- Monitor pilot rollout across regions
- Capture learning outcomes and feedback
- Iterate product based on facilitator + participant input
- Build case studies for scaling

**Session Involvement:** Observes 1-2 sessions; receives session report

---

## 4. Core Features (MVP)

### 4.1 Session Management

**Feature: Create Room**
- Facilitator initiates session with region selection + scenario template
- System generates unique room ID + shareable link
- Session state: active, paused, ended
- Metadata: facilitator name, date/time, expected participants

**Feature: Join Room**
- Participants use room ID or link to join
- Confirmation message in chat ("X has joined")
- No authentication required (pilot phase); room ID is security
- Max participants: 4 + facilitator

**Feature: Session Lifecycle**
- **Start:** Facilitator sends opening narrative ("You are regional authorities in Valleyholm...")
- **Active:** Participants and BOT exchange messages
- **Pause:** Facilitator pauses chat, time for offline discussion
- **End:** Facilitator explicitly ends session; messages locked, report generated

### 4.2 Chat Interface

**Feature: Message Sending**
- Participants type decisions/questions in chat
- Message appears immediately in UI
- Sent to Onyx API with context (room ID, character role, decision framing)
- Response streamed back in real-time

**Feature: Conversation Display**
- Timeline view of all messages (facilitator + participants + BOT)
- Each message shows: speaker role, timestamp, message content
- BOT responses show citation sources (Onyx retrieves from knowledge base)
- Emojis for quick action labels ("🎯 Decision", "❓ Question", "💭 Reflection")

**Feature: Facilitator Controls**
- **Pause Button:** Stops new messages (for offline debrief)
- **Narrator Mode Toggle:** Switch BOT between narrative / character roleplay / analyst mode
- **Inject Challenge:** Facilitator types direct narrative injection ("Storm warning: 20% crop loss predicted")
- **Session Summary:** Auto-generated report of key decisions + BOT responses

### 4.3 Onyx API Integration

**Integration Points:**

1. **Session Creation**
   - POST `/api/chat/create-chat-session` with persona_id (Regional BOT agent)
   - Returns `chat_session_id`
   - Stored server-side with room metadata

2. **Message Streaming**
   - POST `/api/chat/send-message` with:
     - `chat_session_id`
     - `message` (participant decision/question)
     - `file_descriptors` (optional: uploaded region documents)
     - `retrieval_options` (limit to fictional region KB, not general web)
   - Stream response back to UI in real-time
   - Parse citations to link decisions to knowledge base sources

3. **Character Personas**
   - Create custom Onyx personas for each stakeholder (Farmers, Business, NGO, etc.)
   - Each persona has system prompt biasing response toward stakeholder interests
   - Facilitator can switch personas mid-session ("Now, here's the farmers' response...")

4. **Knowledge Base Integration**
   - Load fictional region documentation into Onyx (geography, economy, governance, stakeholders)
   - Onyx retrieves relevant context for each message
   - Ensures BOT grounds responses in fictional world (not general knowledge)

### 4.4 Fictional Region Knowledge Base

**MVP Content (Minimal Viable KB):**

**Doc 1: Regional Overview (500 words)**
- Geography: Location, climate zone, key terrain features
- Demographic: Population, major towns, economic centers
- Climate Challenge: Specific vulnerabilities + observed impacts

**Doc 2: Economic Sectors (1500 words)**
- Agriculture: Subsectors (dairy, wine, forestry), employment, current challenges
- Tourism: Winter sports + summer hiking, seasonal economy, climate dependency
- Manufacturing: Key industries, employment, supply chain
- Research: University presence, innovation capacity

**Doc 3: Governance & Stakeholders (1000 words)**
- Regional authority structure, decision-making process
- 7 Municipality profiles (size, priorities, economic base)
- Civil society: NGOs, business associations, farmer unions
- Stakeholder ecosystem map

**Doc 4: Scenario Library (2000 words)**
- **Scenario 1: Subsidy Dilemma** (alpine agriculture under water stress)
- **Scenario 2: Tourism Pivot** (winter season shortening, need for new attractions)
- **Scenario 3: Innovation Portfolio** (where to invest limited R&D funding)

**Total: ~5000 words loaded into Onyx RAG**

**Post-MVP Expansion:**
- Video region walkthrough
- Interactive stakeholder interviews (video clips)
- Economic data dashboards
- Historical decision case studies

---

## 5. Facilitator Guide (MVP)

### 5.1 Guide Structure

**Section 1: Philosophy & Learning Design (5 pages)**
- Why game-based learning works for climate transitions
- Facilitator role: guide, not instructor
- Balance between participant agency and learning rigor
- Ethical dimensions: equity, stakeholder voice, power dynamics

**Section 2: Session Preparation (3 pages)**
- Pre-session checklist: room creation, facilitator setup, participants briefed
- Choosing region + scenario for your group
- Technical setup: testing Onyx connection, audio/video setup
- Participant briefing: 10-minute pre-session orientation call

**Section 3: Session Running (8 pages)**

**3.1: Opening (15 min)**
- Facilitator reads region briefing (provided script)
- Explain learning objectives
- Introduce scenario + decision point
- Invite first participant decision

**3.2: Active Play (60-75 min)**
- Participant makes decision → posts in chat
- BOT (Onyx) responds with implications from stakeholder perspective
- Facilitator monitors for:
  - **Engagement:** Participants actively deciding or passive?
  - **Complexity:** Introducing conflicts? ("Farmers opposing your subsidy")
  - **Reflection:** Prompting "why" questions?
- Facilitator interventions:
  - **Inject Challenge:** "The university just proposed counter-offer"
  - **Pause & Reflect:** "What would happen if this policy fails?"
  - **Switch Perspectives:** "Let's hear from the farmers directly"

**3.3: Reflection (15-20 min)**
- Facilitator leads structured debrief:
  - "What surprised you about stakeholder responses?"
  - "Who benefited from your decisions? Who was disadvantaged?"
  - "How would you approach this differently in your real region?"
- Capture key insights (facilitator fills template)

**Section 4: BOT Persona Prompting (4 pages)**
- How to switch BOT modes mid-session
- Example prompts for each stakeholder persona
- How to inject narrative complications
- When to let BOT improvise vs. steering toward learning goal

**Section 5: Troubleshooting (3 pages)**
- Participant disengagement → re-frame as learning opportunity
- Group conflict → frame as realistic, debrief equity implications
- BOT goes off-narrative → facilitator gently redirects
- Technical issues → fallback to facilitator narrative (BOT optional)

**Section 6: Post-Session (2 pages)**
- Collect participant feedback (quick 5-question survey)
- Generate session report (auto-generated + facilitator notes)
- Send learning insights to Climate-KIC
- Debrief with co-facilitators

**Total: ~30 pages (detailed, with examples and scripts)**

### 5.2 Key Facilitator Principles

1. **Participant agency is paramount** → don't script outcomes, but introduce realistic constraints
2. **Conflict teaches** → let stakeholder tensions surface, don't smooth them away
3. **Reflection matters more than "right" answers** → focus on "why" and systemic impact
4. **You are narrator, not judge** → don't moralize about decisions; let consequences speak
5. **Equity is core** → always ask "who benefits, who loses?"

### 5.3 Facilitator Training Plan

**Before Pilot:**
- 4-hour online workshop (all facilitators)
  - 1 hour: Climate-KIC methodology + regional resilience frameworks
  - 1.5 hours: Game-based learning principles + session dynamics
  - 1.5 hours: Technical walkthrough + Onyx troubleshooting
- 1-hour practice session with Product team (observing, Q&A)
- Access to Facilitator Guide + video library

**During Pilot:**
- Weekly sync: facilitators share observations, iterate prompts
- Monthly debrief: capture learning, refine scenarios

---

## 6. Technical Architecture

### 6.1 System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                     CLIMATE-KIC PILOT BOT                      │
├─────────────────────────────────────────────────────────────────┤
│
│  ┌──────────────────────┐       ┌──────────────────────┐
│  │  Frontend (Browser)  │       │  Facilitator Panel   │
│  │   - Chat UI          │◄────►│  - Pause             │
│  │   - Room join/create │       │  - Narrator toggle   │
│  │   - Message display  │       │  - Inject challenge  │
│  └──────────────────────┘       └──────────────────────┘
│           │                              │
│           └──────────┬───────────────────┘
│                      │
│           ┌──────────▼─────────┐
│           │  Next.js API       │
│           │  ┌────────────────┐│
│           │  │ Room Manager   ││
│           │  │ Session State  ││
│           │  │ Message Cache  ││
│           │  │ Onyx Handler   ││
│           │  └────────────────┘│
│           └─────────┬──────────┘
│                     │
│        ┌────────────┴────────────┐
│        │                         │
│   ┌────▼─────┐          ┌───────▼──────┐
│   │ Postgres  │          │ Onyx API     │
│   │ (messages,│          │ (streaming   │
│   │  sessions)│          │  responses)  │
│   └──────────┘          └──────────────┘
│                                │
│                         ┌──────▼──────────┐
│                         │ LLM (via Onyx)  │
│                         │ + KB (Region)   │
│                         └─────────────────┘
└─────────────────────────────────────────────────────────────────┘
```

### 6.2 Data Model

**Room**
```json
{
  "room_id": "uuid",
  "facilitator_id": "uuid",
  "region": "valleyholm",
  "scenario": "subsidy_dilemma",
  "created_at": "ISO timestamp",
  "started_at": null,
  "ended_at": null,
  "status": "active|paused|ended",
  "participants": ["name1", "name2"],
  "onyx_session_id": "string",
  "facilitator_notes": "text"
}
```

**Message**
```json
{
  "message_id": "uuid",
  "room_id": "uuid",
  "sender": "participant|facilitator|bot",
  "sender_name": "string",
  "role": "participant|narrator|farmers_union|etc",
  "content": "string",
  "created_at": "ISO timestamp",
  "onyx_message_id": "int (from streaming response)",
  "citations": [{"source": "doc_id", "text": "excerpt"}],
  "is_injected": "boolean (facilitator narrative injection)"
}
```

**Session Report** (auto-generated)
```json
{
  "report_id": "uuid",
  "room_id": "uuid",
  "facilitator_name": "string",
  "date": "ISO date",
  "duration": "minutes",
  "participants": ["name1", "name2"],
  "key_decisions": [
    {
      "decision": "Invest in forestry innovation",
      "rationale": "quoted from participant chat",
      "stakeholder_reactions": "summarized from BOT responses"
    }
  ],
  "learning_insights": "facilitator notes from debrief",
  "participant_feedback": "aggregated survey responses"
}
```

### 6.3 API Endpoints

**Backend (Next.js App Router)**

```
GET /api/health
  Response: { status, time, onyx: { ready, errors } }

GET /api/chat?roomId=ROOM_ID
  Response: { messages, aiThinking, typingUsers }

GET /api/chat?action=create
  Response: { roomId, sessionId, onyxError? }

POST /api/chat
  Body: { content, roomId, sender }
  Response: { id, role, content, sender, timestamp, error? }

DELETE /api/chat?roomId=ROOM_ID
  Response: { success: true }
```

**Onyx Integration**

```
POST ${EXTERNAL_CHAT_ENDPOINT}/chat/create-chat-session
  Body: { persona_id, description }
  Response: { chat_session_id }

POST ${EXTERNAL_CHAT_ENDPOINT}/chat/send-message
  Body: { chat_session_id, message, retrieval_options }
  Response: STREAM { type, content, citations } (if streaming enabled)
```

### 6.4 Known Constraints & Solutions

| Issue | Root Cause | MVP Solution | Post-MVP |
|-------|-----------|--------------|----------|
| **Ephemeral filesystem** | Netlify serverless | Use Postgres for message/session persistence | Scale to managed DB |
| **404 polling spam** | Client retries on room not found | Implement exponential backoff + graceful "room not found" UI | Websocket for real-time |
| **Onyx timeout** | Long API calls (10-20s) | Set timeout + retry 3x with exponential backoff | Implement request queuing |
| **Streaming response parsing** | JSON packets can be malformed | Wrap in try-catch, log errors, send graceful error to UI | Add circuit breaker pattern |
| **Multi-participant conflicts** | Everyone typing simultaneously | Implement simple message queue + sequential processing | Implement typing indicators |
| **Session state desync** | Client/server out of sync | Timestamp all messages, server-side state of truth | Optimistic updates + reconciliation |
| **Onyx knowledge base scope** | LLM can hallucinate about real world | Restrict retrieval to fictional region docs + disable web search | Implement RAG filtering + prompt guards |

---

## 7. Success Metrics & Learning Goals

### 7.1 User Learning Outcomes

**Primary (Measured via debrief + post-session survey):**

1. **Systems Thinking:** Participant recognizes multi-stakeholder interdependencies
   - Evidence: "I didn't expect farmers to react that way to subsidies"

2. **Strategic Adaptation:** Participant applies frameworks (innovation portfolio) to real region
   - Evidence: "We should map our key stakeholders like the BOT did"

3. **Equity Awareness:** Participant reflects on distributional impacts of decisions
   - Evidence: "Who wins? Who loses? That matters for buy-in"

### 7.2 Product Metrics

| Metric | Target | Rationale |
|--------|--------|-----------|
| **Session completion rate** | >80% (complete full 90-120 min) | High drop-off = engagement issue |
| **Onyx response latency** | <10s average | User experience depends on snappy BOT |
| **Message persistence** | 100% (no lost messages) | Critical for debrief accuracy |
| **Facilitator satisfaction** | >4/5 | Facilitators are product champions |
| **Participant feedback** | >3.5/5 on "learned something" | Core learning outcome |
| **System uptime** | >99% (during scheduled sessions) | Pilot credibility |
| **Knowledge base relevance** | >70% of BOT citations relevant to fictional region | Prevents hallucination |

### 7.3 Pilot Success Criteria

**MVP Launch Success (Week 3):**
- ✅ Functional chat UI with room creation/joining
- ✅ Messages persist across session lifecycle
- ✅ Onyx integration with fallback error handling
- ✅ Minimal fictional region KB (Valleyholm) loaded into Onyx
- ✅ Facilitator guide complete with scripts + scenarios
- ✅ 2-3 beta sessions run with facilitators (no participants yet)
- ✅ Session report auto-generation working
- ✅ GDPR audit passed (no personal data collected during pilot)

**Pilot Rollout Success (Weeks 4-8):**
- ✅ 5-10 sessions run with real regional authorities
- ✅ Participant learning outcomes demonstrated
- ✅ Facilitator feedback informs product iteration
- ✅ Session reports capture decision patterns + stakeholder reactions
- ✅ Readiness for scaled rollout to 10+ regions

---

## 8. Roadmap: MVP (3 weeks) → Production (6+ months)

### Phase 1: MVP Launch (Feb 19, 2026)
**Focus: Functional core, facilitator enablement**
- ✅ Chat infrastructure (room creation, message persistence, Onyx integration)
- ✅ Facilitator controls (pause, narrative injection, summary)
- ✅ Minimal fictional region (Valleyholm, 5k words)
- ✅ Facilitator guide (30 pages + scripts)
- ✅ Session reporting (auto-generated)
- 🔄 Limited testing (internal team + 2-3 beta facilitators)

### Phase 2: Pilot Rollout (Mar-Apr 2026)
**Focus: Real user feedback, scenario refinement, scaling to 10+ facilitators**
- Enhanced fictional regions (2-3 additional regions)
- Improved facilitator prompts based on beta feedback
- Analytics dashboard (facilitator + program manager views)
- Video region orientation (async pre-session learning)
- Community features (facilitator forum, scenario sharing)

### Phase 3: Production Readiness (May-Jun 2026)
**Focus: Scale to 50+ regions, institutional integration**
- Multi-language support (initial: English + German + French)
- Advanced scenario engine (procedural scenario generation)
- Learning outcome measurement (pre/post assessment)
- Integration with Climate-KIC learning management system
- Facilitator certification program
- GDPR + data governance audit for multi-region deployment

### Phase 4: Growth (Jul-Dec 2026 and beyond)
**Focus: Expand to adjacent use cases, monetization**
- Corporate climate leadership training (Fortune 500 sustainability teams)
- Youth education programs (high schools + universities)
- Open-source release (allow other organizations to create custom regions)
- Licensing model for regional authorities + corporate clients
- Integration with other Climate-KIC tools (innovation fund, policy toolkit)

---

## 9. Dependencies, Risks & Mitigations

### 9.1 Critical Dependencies

| Dependency | Owner | Milestone | Risk |
|------------|-------|-----------|------|
| **Onyx API stability** | Onyx team | Day 1 (integration) | API downtime blocks sessions |
| **Fictional region content** | Climate-KIC subject matter experts | Day 6 (KB loading) | Shallow content limits realism |
| **Facilitator availability** | Regional partners | Day 10 (training) | Limited beta testing capacity |
| **GDPR compliance sign-off** | Legal / IT security | Day 14 (pre-launch) | Audit delays = launch delay |
| **Participant recruitment** | Regional program managers | Post-launch | Low uptake invalidates learning |

**Mitigations:**
- Establish daily Onyx sync in Week 1 to catch integration issues early
- Start fictional region content in parallel (Week 1) while engineering proceeds
- Identify facilitators by Day 5; prioritize beta session preparation
- Pre-schedule GDPR audit for Day 7 (allow 7-day review window)
- Regional program managers commit to 5+ participant session bookings by Week 2

### 9.2 Technical Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| **Onyx API timeouts** | Medium | Session stalled, facilitator manual fallback | Implement 15s timeout + 3x retry + graceful error message |
| **Message persistence failure** | Low (Postgres is reliable) | Data loss, session integrity compromised | Daily automated backups; rollback procedure documented |
| **Knowledge base hallucination** | Medium | BOT makes up region facts | Disable web search; prompt instruction to restrict retrieval; facilitator review of KB before launch |
| **Multi-participant race condition** | Low (simple message queue) | Out-of-order or duplicate messages | Timestamp all messages; server-side sequencing |
| **GDPR non-compliance** | Low (minimal data collection) | Legal liability, pilot cancellation | Audit template ready; no email collection; no IP logging; clear privacy policy |

### 9.3 Product Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| **Facilitator confusion** | Medium | Poor session quality, low participant engagement | Detailed guide with video walkthrough; facilitator training session; in-session chatbot help |
| **Participant disengagement** | Medium | Shallow learning outcomes; negative feedback | Scenario design emphasizes conflict + stakes; facilitator coaching on engagement triggers |
| **Regional uptake low** | Medium | Insufficient pilot feedback; delayed scaling | Regional program managers committed pre-launch; incentivize early adopters |
| **Knowledge base too narrow** | Medium | BOT can't answer participant questions; loses credibility | Expand KB incrementally; facilitator empowered to inject context; fallback to facilitator narrative |

---

## 10. Facilitator Guide: Expanded Sections

### 10.1 Opening Narrative Script (Example)

```
[Facilitator, speaking clearly to all participants]

"Welcome to the Regional Resilience Challenge. Over the next 90 minutes, 
you're stepping into the role of a regional transition authority in Valleyholm—
a fictional region that faces real climate challenges.

Here's what you need to know:

VALLEYHOLM SNAPSHOT:
- Alpine foothills region, population ~500,000
- Economy: agriculture (dairy, wine, forestry), tourism, light manufacturing
- Climate Challenge: Warming temps, shifting precipitation, glacier melt, wildfire risk
- Your goal: Design a climate adaptation strategy that balances economic resilience, 
  environmental protection, and stakeholder buy-in

Throughout this session:
1. You'll make strategic decisions (e.g., 'Invest in forestry innovation')
2. Our interactive BOT will respond as the region's stakeholders—
   farmers, businesses, municipalities, universities, NGOs
3. You'll see first-order and second-order effects of your decisions
4. You'll face real trade-offs and conflicts

This isn't a test with right/wrong answers. It's a space to experiment,
learn from mistakes (without real consequences), and reflect on what 
those insights mean for your actual region.

One more thing: You'll notice our BOT sometimes challenges your decisions.
That's intentional. Real transitions face pushback. Your job is to navigate it.

Ready? Let's begin. Our first scenario:

SCENARIO: SUBSIDY DILEMMA

Valleyholm's dairy farmers are facing pressure from climate impacts.
Yields are down 8% due to irregular spring weather. The Farmers Association
is asking the regional government for emergency subsidies.

Your decision:
- Option A: Issue 2-year subsidies (supports farmers, costs budget, delays transition)
- Option B: Invest in climate-resilient crop breeding (long-term, risky, takes years)
- Option C: Hybrid: limited subsidies + innovation fund

What's your decision, and why?

[Wait for participant response in chat. Proceed to active play.]
```

### 10.2 Facilitator Interventions (Decision Points)

**When Participants Are Passive:**
```
Facilitator: "[Participant name], I notice you're listening but haven't weighed in yet.
What's your instinct here? As a regional authority, how would you respond 
to the farmers' subsidy request?"

Goal: Draw out quieter voices; ensure all perspectives heard
```

**When Conflict Emerges:**
```
[Participant A advocates subsidies; Participant B wants innovation fund]

Facilitator: "Interesting—we have a real tension here. This is what transitions look like.
Let me introduce the BOT's perspective on each option:

BOT [as Farmers Union]: 'If you don't help us now, 20% of dairy farms close by 2030.'
BOT [as Youth Council]: 'We need long-term change, not band-aids. Invest in innovation.'

Both are true. Participant A, how do you respond to the youth argument?
Participant B, what do you say to the farmers' survival concern?"

Goal: Surface multiple stakeholder logics; move beyond binary choices
```

**When Group Glosses Over Equity:**
```
[Participants decide to cut agricultural subsidies completely]

Facilitator: "OK, so you're prioritizing innovation. But let's pause and think:
What happens to the dairy farmers who can't survive the transition?
Where do they go? Do they retrain? Leave the region?

BOT, from the farmers' perspective: 'Our families have farmed here for generations.
You're asking us to disappear. That's not adaptation for us—it's displacement.'

Participants, what's your response? How do we support people, not just sectors?"

Goal: Ensure equity dimensions surface; avoid technocratic blindness
```

### 10.3 BOT Persona Prompting

**Narrator Mode** (BOT summarizes regional impacts objectively)
```
System Prompt: "You are the narrator of Valleyholm. Provide factual, 
neutral summaries of regional dynamics, economic data, and climate trends. 
Use knowledge from the Valleyholm Wikipedia knowledge base. Do not adopt 
stakeholder bias; remain objective."

Example Response:
"Valleyholm's agricultural sector employs 8,200 people (3.2% of workforce). 
Dairy is the primary subsector. Recent climate data shows 15% yield decline 
over 5 years. Stakeholder surveys indicate 60% of farmers support innovation 
investment; 40% prioritize short-term support."
```

**Farmers' Perspective Mode** (BOT voices farmer viewpoint)
```
System Prompt: "You represent the Farmers Association of Valleyholm. You 
advocate for farmer survival and prosperity. You acknowledge climate realities 
but prioritize immediate support and fair transition. Use emotional + economic 
reasoning. Ground responses in Valleyholm agriculture data."

Example Response:
"Look, we understand the need to adapt. But climate change isn't our fault. 
We've been custodians of this land for generations. You're asking us to bear 
the cost of transition. We need immediate support—subsidies, crop insurance, 
access to new seeds—while we adapt. Innovation takes decades. Families need 
to survive the next 5 years."
```

**University/Innovation Perspective Mode** (BOT emphasizes long-term transformation)
```
System Prompt: "You represent the Valleyholm Climate Research Institute. 
You advocate for innovation, systems transformation, and evidence-based policy. 
You acknowledge farmer concerns but emphasize necessity and opportunity of 
transition. Use research + data-driven language."

Example Response:
"The data is clear: incremental subsidies slow the inevitable transition. 
We're at a tipping point where innovation in climate-resilient breeding, 
water management, and diversification into high-value crops could position 
Valleyholm as a climate leader. Yes, it requires upfront investment and 
farmer training. But the region that leads in climate-smart agriculture 
wins the market in 2040. Subsidies delay that."
```

**Facilitator switches BOT mode** via control panel:
```
Facilitator clicks "Narrator Mode" → Participants see factual summary
Facilitator clicks "Farmers' Perspective" → Participants see emotional farmer viewpoint
[Discussion ensues]
Facilitator clicks "University Voice" → Counter-argument
[Participants synthesize; move toward decision]
```

---

## 11. Technical Implementation Details

### 11.1 Message Streaming Architecture

**Current Issue:** Raw Onyx streaming can be hard to parse; clients don't know when response is done.

**MVP Solution:**

1. **Backend captures stream (optional; not in current implementation):**
```javascript
const response = await fetch(`${process.env.EXTERNAL_CHAT_ENDPOINT}/chat/send-message`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${ONYX_API_KEY}` },
  body: JSON.stringify({ chat_session_id, message, retrieval_options }),
})

let fullText = '';
let citations = {};

for await (const line of response.body) {
  const packet = JSON.parse(line);
  if (packet.obj?.type === 'message_delta') {
    fullText += packet.obj.content;
    // Send to client via WebSocket or polling
  }
  if (packet.obj?.type === 'citation_delta') {
    citations = { ...citations, ...packet.obj.citations };
  }
  if (packet.obj?.type === 'stop') break; // End of response
}

// Save to DB
await db.messages.create({
  room_id, sender: 'bot', content: fullText, citations
})
```

2. **Frontend receives streamed chunks and renders incrementally (optional):**
```javascript
const eventSource = new EventSource(`/api/chat/stream?roomId=${roomId}`);
eventSource.onmessage = (event) => {
  const { chunk, isComplete } = JSON.parse(event.data);
  appendToChatUI(chunk);
  if (isComplete) eventSource.close();
}
```

3. **Error handling:**
```javascript
if (timeout > 15s) {
  return "Sorry, the response is taking longer than expected. " +
         "Let me try again." [retry logic]
}

if (malformed JSON) {
  return "I had trouble processing that. Could you rephrase your question?"
}
```

### 11.2 Session Persistence (Postgres)

**Migration from ephemeral → durable:**

```sql
CREATE TABLE rooms (
  id UUID PRIMARY KEY,
  facilitator_id VARCHAR,
  region VARCHAR,
  scenario VARCHAR,
  created_at TIMESTAMP,
  started_at TIMESTAMP,
  ended_at TIMESTAMP,
  status VARCHAR,
  onyx_session_id VARCHAR,
  facilitator_notes TEXT
);

CREATE TABLE messages (
  id UUID PRIMARY KEY,
  room_id UUID REFERENCES rooms(id),
  sender VARCHAR (participant|facilitator|bot),
  sender_name VARCHAR,
  content TEXT,
  created_at TIMESTAMP,
  onyx_message_id INT,
  citations JSONB,
  is_injected BOOLEAN
);

CREATE INDEX idx_room_id ON messages(room_id);
CREATE INDEX idx_created_at ON messages(created_at);
```

**Connection pooling (avoid timeout on long sessions):**
```javascript
const pool = new Pool({
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});
```

### 11.3 Facilitator Control Panel API (Planned)

**Pause/Resume:**
```
POST /api/chat/control?roomId=ROOM_ID
Body: { action: "pause" }
Response: 
{
  status: "paused",
  message: "Chat is paused. You can now discuss offline.",
  paused_at: "2026-02-15T14:30:00Z"
}
```

**Inject Narrative:**
```
POST /api/chat/inject?roomId=ROOM_ID
Body: {
  sender_name: "Facilitator [Narrator]",
  role: "narrator",
  content: "Breaking news: The regional government announced a new €5M innovation fund.",
  is_injected: true
}
Response:
{
  message_id: "uuid",
  displayed_in_chat: true
}
```

**Switch BOT Mode:**
```
POST /api/chat/control?roomId=ROOM_ID
Body: { action: "switch_persona", persona: "farmers_union" }
Response:
{
  status: "persona_switched",
  message: "BOT is now speaking as the Farmers Association."
}
```

---

## 12. GDPR & Privacy (MVP Compliance)

### 12.1 Data Collected

**Minimal, session-based:**
- Room ID, facilitator name, participant first names (no email/phone)
- Chat messages (decision + questions)
- Session metadata (start/end time, duration)
- Optional: post-session survey responses (5 questions)

**Not collected:**
- Personal email, phone, address
- Location data
- Browsing behavior
- IP logs

### 12.2 Storage & Access

- Messages stored in Postgres (secured, encrypted at rest)
- Access restricted to: facilitator (their sessions), Climate-KIC program manager (for reporting)
- No third-party access (Onyx API doesn't retain messages; stateless)
- Session data deleted 90 days post-session (unless explicit consent for research)

### 12.3 Privacy Notice

**Displayed before session:**
```
"This session will be recorded (chat history stored securely for debrief).
Your messages may be used anonymously in Climate-KIC learning reports.
You can request deletion of your session data within 30 days.
Contact: privacy@climate-kic.org"
```

---

## 13. Success Launch Checklist (Week 3)

### Engineering
- [ ] Postgres persistence configured + tested
- [ ] Onyx API integration with timeout/retry logic
- [ ] Room creation/join endpoints (no 404 spam)
- [ ] Facilitator control panel (pause, narrative injection, summary)
- [ ] Error handling graceful (no crashes, clear error messages)
- [ ] Session lifecycle management (start/pause/end)
- [ ] Health endpoint (/api/health) reports all systems status
- [ ] Load test: 4 concurrent sessions + 10 pending rooms
- [ ] Code review + deployment checklist signed off

### Product
- [ ] Fictional region (Valleyholm) loaded into Onyx
- [ ] 3 scenario templates ready (with facilitator scripts)
- [ ] Session reporting auto-generates (PDF + JSON)
- [ ] Facilitator guide complete (30 pages) + video walkthrough (5 min)
- [ ] Facilitator training slides ready
- [ ] Beta testing plan (2-3 facilitators) executed
- [ ] Participant feedback template ready

### Legal & Compliance
- [ ] Privacy policy drafted + legal review complete
- [ ] GDPR audit passed (data handling, retention, access control)
- [ ] Terms of service for beta pilot
- [ ] Consent form for session recording + data use

### Launch Operations
- [ ] Production environment (Netlify or alternative) configured
- [ ] Backup/rollback procedure documented
- [ ] 24-hour support contact (escalation path)
- [ ] Monitoring alerts set (uptime, error rate, latency)
- [ ] Facilitator onboarding call scheduled (kickoff)
- [ ] First participant session booked (Week 4)
- [ ] Communications plan: announcement to regional partners

---

## 14. Post-Launch: Iteration Framework

### First 2 Weeks (Feb 19-Mar 5)
**Objective:** Identify and fix blockers; refine experience

- **Daily standups:** Product + engineering sync on issues
- **Facilitator feedback:** Collect via daily check-ins
- **Bot quality:** Monitor for hallucinations; update KB as needed
- **Technical metrics:** Uptime, latency, error rates
- **Quick fixes:** Deploy as needed (no formal release cycle in pilot)

### Weeks 3-4 (Mar 6-19)
**Objective:** 5-10 sessions completed; learning outcomes measured

- **Participant feedback:** Aggregate survey data
- **Session reports:** Analyze decisions + stakeholder reactions
- **Facilitator improvements:** Refine scripts based on real usage
- **Knowledge base:** Expand if common BOT knowledge gaps emerge
- **Roadmap planning:** Prioritize Phase 2 features

### Weeks 5-8 (Mar 20-Apr 16)
**Objective:** Transition to scaled pilot; 20+ sessions across regions

- **Regional rollout:** Activate 3-5 additional pilot regions
- **Facilitator network:** Establish community of practice
- **Analytics dashboard:** Provide real-time insights to program managers
- **Learning outcomes:** Measure pre/post regional capacity shifts

---

## 15. Appendices

### A. Fictional Region Deep-Dive (Valleyholm)

**[15 pages of detailed region specification, not included in this executive PRD but referenced in full facilitator guide]**

- Geography maps + climate vulnerability layers
- Economic sector breakdowns + employment data
- Stakeholder profiles (7 municipalities + 12 civil society orgs)
- Scenario decision trees (showing second-order consequences)

### B. Onyx API Integration Walkthrough

**[Technical guide for engineering team; not included here but referenced in code repo]**

- Setup: Creating Onyx organization + personas
- Streaming response handling
- Citation extraction
- Custom prompt engineering for each stakeholder persona
- RAG configuration (limit knowledge base to fictional region)

### C. Facilitator Training Materials

**[Video scripts, slide decks, practice scenarios; not included here but referenced in training module]**

- 4-hour training curriculum
- Role-playing practice (facilitators as participants)
- Common pitfalls + how to recover
- Session debrief templates

### D. Product Analytics Framework

**[Dashboard specs for Phase 2; not included here but informs engineering planning]**

- Key metrics by region + facilitator
- Decision heat maps (which choices are popular)
- Stakeholder response patterns (who objects most?)
- Learning outcome tracking

---

## Document Version History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 0.1 | Jan 26, 2026 | [Product Lead] | Initial outline from strategic brief |
| 0.9 | Jan 28, 2026 | [Product Lead] | Full draft, internal review |
| 1.0 | Jan 29, 2026 | [Product Lead] | Final for team kickoff |

---

**This PRD is a living document. Updates occur after each sprint based on learnings. Next review: March 5, 2026.**

---

## Contact & Escalation

- **Product Lead:** [Name, email, Slack]
- **Engineering Lead:** [Name, email, Slack]
- **Facilitator Coordinator:** [Name, email, Slack]
- **Climate-KIC Program Manager:** [Name, email, Slack]

**Weekly sync:** Monday 10:00 CET (all stakeholders)
**Critical issues:** Slack #bot-pilot channel
