# Product Notes

## AI Climate Sandbox Simulation — Current Status

**Current version:** Onyx agent API + custom UI with role selection.

**Timeline**
- First test: February 23, 2026
- Live: March 2, 2026

## Alternative Solutions Evaluated

### Option 1: Custom GPT (More Reliable)
- Link: https://chatgpt.com/g/g-695e6d9721c08191b79bbcdcddf34058-climate-sandbox
- Powered by: ChatGPT 5.2
- How it works:
  - Facilitator types `/start` to begin
  - Describes fictional region using a template
  - Bot acts as narrator (RPG-style) or specific stakeholders (farmers, universities, NGOs)
  - Commands like `/scene`, `/reflect`, `/summary` control narrative flow
- Strengths:
  - Natural conversation
  - Remembers previous responses to build story coherence

### Option 2: Interactive Web Application
- Link: https://climate-kic-regional-bot-1000319781716.us-west1.run.app
- Powered by: Gemini 3
- Strengths:
  - Wikipedia-style interface for fictional region file
  - Click-through navigation
  - More visual/structured approach

## Core Requirements Covered by Both Options
- RPG-style narrator describing the region
- Character perspective switching (farmers, universities, etc.)
- Memory of previous responses for narrative building
- Session-only availability (no data stored after)
  - Note: GPT version stores in user account if logged in; can be deleted

## Open Questions
1. **Content & Frameworks:** The brief mentions being bound to Climate-KIC training materials/frameworks.  
   - Do we have specific documents to integrate?
   - Should user/facilitator be able to upload files?
2. **Fictional Regions:** Pre-built regions vs facilitator-created each session?

## Additional Notes & Constraints
- Consistency through database: service-side vs chat-side?
- Scale target: 50 users in 5–8 groups
- Latency target: 30 seconds response is acceptable
- Facts file will be provided and fed into the Onyx agent
- Add EU-level regulator persona
- Facilitator needs onboarding/management
- Conversation sessions must be saved to resume next day
