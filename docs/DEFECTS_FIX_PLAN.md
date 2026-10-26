# Julie AiOS Phase C.1 Defect Fixes - Test Plan

## Overview
This document tracks all reported defects, root causes, fixes, and verification steps for the Phase C.1 correction run.

---

## Defect 1: Terminal and Agents Pages Render Blank

### Root Cause Analysis Required
- Terminal page: WebSocket uses hardcoded `ws://` instead of protocol-aware `wss://` for HTTPS
- Agents page: `.empty-state` CSS class undefined; need to check if JS runtime crash or unstyled rendering

### Fixes Needed
1. **Terminal WebSocket Protocol**: Change `new WebSocket(\`ws://${window.location.host}/terminal-ws\`)` to use protocol-aware URL:
   ```javascript
   const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
   const ws = new WebSocket(`${wsProtocol}//${window.location.host}/terminal-ws`);
   ```

2. **Agents Page CSS**: Add `.empty-state` class to `styles.css`:
   ```css
   .empty-state {
     text-align: center;
     padding: 60px 20px;
     color: var(--text-dim);
   }
   .empty-state p { margin-top: 8px; }
   ```

3. **Runtime Error Check**: Verify no JavaScript crashes on Agents page mount
   - Check `/api/agents` returns real data with session cookie
   - Check console for mount-time errors

### Verification Steps
1. Build and restart service
2. Access `https://julie.ijihost.com/terminal` - should show terminal interface, not blank
3. Access `https://julie.ijihost.com/agents` - should show agent list or styled empty state
4. Run in browser dev tools:
   - Network tab: `/api/agents` returns 200 with data
   - Console: no errors
5. Test WebSocket connection: execute `echo TEST` command

---

## Defect 2: Tasks and Tools Read-Only - Need Interactive Controls

### Current State
- Tasks: Can only create new tasks; cannot edit, delete, move statuses, or update descriptions
- Tools: Only displays list; no enable/disable controls

### Fixes Needed

#### Tasks Page Improvements
1. **Edit Task Modal**: Add ability to edit title, description, status, priority
2. **Delete Task**: Add delete button with confirmation
3. **Status Draggable/Selectable**: Change status dropdown per task
4. **Description Display**: Show description, run output, timestamps on card

#### Tools Page Improvements
1. **Backend Support**: Check if backend supports enable/disable tools
2. **UI Controls**: Add enable/disable toggle where backend supports it
3. **Honest Disabled States**: If backend doesn't support, show disabled state with tooltip

### Verification Steps
1. Create task → edit it → delete it → move through statuses
2. View task card shows description, run output, timestamps
3. Verify API calls: `/api/tasks/:id` PATCH and DELETE work
4. Check tool controls match backend capabilities

---

## Defect 3: Bottom Nav Overloaded - Reduce to 5 Items

### Current Bottom Nav (9 items)
Home, Chat, Voice, Agents, Tools, Analytics, Terminal, Tasks

### Required Bottom Nav (5 items)
Home, Chat, **AI Center (holographic orb)**, Tools, Profile

### Migration Plan
Move to Home quick-shortcut grid cards:
- Agents → Quick shortcut card
- Terminal → Quick shortcut card
- Analytics → Quick shortcut card
- Tasks → Quick shortcut card (Task Board)

### Design Requirements
- Mobile layout matches reference: glass cards, holographic orb center, widget grid
- Bottom tab bar minimal
- Center AI center button prominent

### Verification Steps
1. Verify bottom nav has exactly 5 items
2. Verify all moved items accessible from Home page
3. Test mobile responsive layout
4. Check glass card holographic orb styling

---

## Defect 4: Voice Recording Creates New Conversation Each Time

### Root Cause
Voice page `submitVoice()` creates new conversation when `convId` is null, but never persists it. Each recording starts fresh.

### Current Code Issue
```javascript
const submitVoice = async (text: string) => {
  setStatus("processing");
  try {
    if (!convId) {
      const d = await api.createConversation(1, "Voice conversation");
      setConvId(d.conversation.id);
      await api.sendMessage(d.conversation.id, text);
    } else {
      await api.sendMessage(convId, text);  // ← Only sends, doesn't fetch reply
    }
    // Since sendMessage waits for the reply, we fetch it.
    const msgs = await api.messages(convId ?? 0);  // ← Uses potentially stale convId
    const last = msgs.messages[msgs.messages.length - 1];
    if (last) { setResponse(last.text); speak(last.text); }
    else setStatus("idle");
  } catch (e) { setStatus("error"); }
};
```

### Fix Required
1. **Store convId in component state persistently** (use `useEffect` to load active conversation)
2. **Reuse existing conversation** instead of creating new one
3. **Verify current conversation ID** before submitting voice message

### Verification Steps
1. Start voice recording in current conversation
2. Submit message
3. Record again - should post to same conversation
4. Check `/api/conversations/:id/messages` shows both messages in same thread

---

## Defect 5: Workspace Switcher Removed - Must Restore

### Current Issue
Workspace API exists (`/api/workspaces`) but UI selector dropped in rebrand

### Fixes Needed

1. **Add Workspace Selector to Header/Shell**
   - Dropdown showing current workspace
   - Ability to switch between workspaces
   - Ability to create new workspace

2. **Scope Data per Workspace**
   - Tasks should filter by selected workspace
   - Conversations should filter by selected workspace
   - All API calls should pass `workspaceId`

3. **Default to Active Workspace**
   - Load active workspace from settings on mount
   - Use that workspace for all operations

### Verification Steps
1. Create multiple workspaces
2. Switch between them
3. Verify tasks/conversations are workspace-scoped
4. Verify API calls include workspaceId

---

## Defect 6: Task Cards Empty - Need Full Details

### Current State
Task cards only show title:
```jsx
<div key={t.id} className="task-card mb-4 p-4" style={{ background: "rgba(0,0,0,0.2)", borderRadius: 8 }}>{t.title}</div>
```

### Required Fields on Card
- Title (already shown)
- Description (first 100-200 chars)
- Status (visual indicator)
- Last run output (if exists)
- Timestamps (created, updated, run_started)
- Priority indicator

### Fixes Needed
1. **Enhance Task Card Component** to show all fields
2. **Wire Chat-Created Tasks** to populate description
3. **Wire Task-Bridge Runs** to populate run output
4. **Display Timestamps** on card

### Verification Steps
1. Create task with description via API
2. Verify card shows description
3. Run task via `/api/tasks/:id/run`
4. Verify card shows last_run_output
5. Verify timestamps display correctly

---

## QA Testing Checklist

### Build & Deploy
- [ ] `npm run build` passes (backend TypeScript)
- [ ] `npm run web:build` passes (frontend Vite)
- [ ] `sudo systemctl restart julie` succeeds
- [ ] Service starts without errors
- [ ] `curl localhost:3000/api/health` returns 200 OK

### Route Access (HTTPS)
- [ ] `https://julie.ijihost.com/` - 200 OK
- [ ] `https://julie.ijihost.com/chat` - 200 OK
- [ ] `https://julie.ijihost.com/voice` - 200 OK
- [ ] `https://julie.ijihost.com/agents` - 200 OK
- [ ] `https://julie.ijihost.com/tools` - 200 OK
- [ ] `https://julie.ijihost.com/analytics` - 200 OK
- [ ] `https://julie.ijihost.com/terminal` - 200 OK
- [ ] `https://julie.ijihost.com/tasks` - 200 OK

### API Authentication
- [ ] `/api/session` returns authenticated state
- [ ] `/api/agents` returns 401 without cookie
- [ ] `/api/agents` returns 200 with valid cookie
- [ ] `/api/tools` returns 401 without cookie
- [ ] `/api/tools` returns 200 with valid cookie

### WebSocket Terminal (Live)
- [ ] Connect to `/terminal-ws` over WSS (when HTTPS)
- [ ] Send `echo HELLO-WORLD` → receive output
- [ ] Send `ls /home/admin` → list files
- [ ] Verify exit code returned
- [ ] Verify audit log entry created

### Voice Conversation Reuse
- [ ] Start voice recording
- [ ] Submit message → note conversation ID
- [ ] Start voice recording again
- [ ] Submit message → verify SAME conversation ID
- [ ] Check `/api/conversations/:id/messages` shows both messages

### Task Interactivity
- [ ] Create task via UI
- [ ] Edit task description
- [ ] Change task status
- [ ] Delete task
- [ ] Run task via `/api/tasks/:id/run`
- [ ] Verify status changes: ready → in_progress → pending_review
- [ ] Verify task card shows description and run output

### Workspace Scoping
- [ ] Create workspace A
- [ ] Create workspace B
- [ ] Switch to A → tasks scoped to A
- [ ] Switch to B → tasks scoped to B
- [ ] Verify conversations also scoped

### Bottom Nav
- [ ] Desktop: Sidebar shows all items
- [ ] Mobile: Bottom nav shows exactly 5 items (Home, Chat, AI Center, Tools, Profile)
- [ ] Quick shortcuts visible on Home page

---

## Tester Instructions

1. **Execute against LIVE deployment** at `https://julie.ijihost.com`
2. **Use authenticated sessions** - test with owner password
3. **Document all errors** with exact messages and timestamps
4. **Capture screenshots** of any visual issues
5. **Test WebSocket** terminal end-to-end with real commands
6. **Verify CORS and cookie** handling for all API calls
7. **Report findings** in structured format per defect

---

## Commit Requirements

After all fixes verified:
- Update `docs/PROJECT_STATE.md` with Phase C.1 completion
- Update `docs/CHANGELOG.md` with all fixes
- Commit message: `Phase C.1: Fix runtime bugs, restore workspaces, improve task UI`

---

*Last updated: 2026-10-26*
