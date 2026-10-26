# Julie AiOS Phase C.1 - Tester Subagent Instructions

## Objective
Independently verify all Phase C.1 fixes against the LIVE deployed app at `https://julie.ijihost.com`.

## Authentication
- Access the app via browser or curl with session cookie
- Use the owner password for authenticated API tests
- Never hardcode credentials in tests

## Test Scope

### 1. Terminal Page Fix (Defect 1)
**Verify:**
- Navigate to `https://julie.ijihost.com/terminal`
- Page renders without blank/whitespace
- Browser console shows no errors
- WebSocket connects successfully (check Network tab for wss://)
- Execute command: `echo "TERMINAL-TEST-OK"`
- Verify output appears in terminal
- Verify exit code returned

**Expected:**
- Terminal UI visible with glass card styling
- WebSocket protocol: wss:// (not ws://) over HTTPS
- Commands execute and display output
- No mixed content warnings in console

### 2. Agents Page Fix (Defect 1)
**Verify:**
- Navigate to `https://julie.ijihost.com/agents`
- Page renders without blank/whitespace
- `.empty-state` CSS class applied if no agents
- No JavaScript console errors on mount
- Check Network tab: `/api/agents` returns 200 or 401 (auth required)

**Expected:**
- Styled empty state or agent list visible
- CSS class `.empty-state` applied
- No runtime errors

### 3. Task Interactivity (Defect 2 & 6)
**Verify:**
1. Create task:
   - Navigate to `/tasks`
   - Select workspace (if multiple exist)
   - Enter task title, click "Add Task"
   - Task appears in "Backlog" column

2. Edit task:
   - Click on task card
   - Edit title, description, status, priority
   - Click Save
   - Verify changes persist

3. Move task through workflow:
   - Change status: backlog → ready → in_progress → pending_review → done
   - Verify visual status indicator changes color

4. Delete task:
   - Delete a task
   - Verify confirmation prompt appears
   - Verify task removed from list

5. Run task:
   - Create task with status "ready"
   - Click "▶ Run Task"
   - Verify status changes: ready → in_progress → pending_review
   - Verify `last_run_output` populated on card

6. Verify task card shows:
   - Title (always visible)
   - Description (first 100-120 chars)
   - Status indicator (colored dot)
   - Last run output (if run)
   - Timestamps (created/started)

**Expected:**
- Full CRUD operations work
- Task cards display all required fields
- API calls: POST /api/tasks, PATCH /api/tasks/:id, DELETE /api/tasks/:id
- No errors in console

### 4. Bottom Nav Reduction (Defect 3)
**Verify:**
1. Desktop view:
   - Sidebar shows all navigation items
   - Bottom nav hidden

2. Mobile view (resize browser to < 768px):
   - Bottom nav shows EXACTLY 5 items: Home, Chat, AI, Tools, Profile
   - Quick shortcuts visible on Home page: Agents, Terminal, Tasks, Insights

3. Verify navigation:
   - Click each bottom nav item → route changes correctly
   - Click each shortcut card → navigates to corresponding page

**Expected:**
- Bottom nav: 5 items only (Home, Chat, AI, Tools, Profile)
- Quick shortcuts on Home page for: Agents, Terminal, Tasks, Analytics
- Glass card styling on shortcuts
- Mobile-responsive layout matches reference

### 5. Voice Conversation Reuse (Defect 4)
**Verify:**
1. Start with empty conversation list
2. Navigate to `/voice`
3. Click "🎤 Start Listening"
4. Speak a test phrase (e.g., "Voice test message one")
5. Note the conversation ID from URL or browser dev tools
6. Click "🎤 Start Listening" again
7. Speak another message (e.g., "Voice test message two")
8. Navigate to `/chat`
9. Open the conversation used for voice messages
10. Verify both messages appear in the SAME conversation thread

**Expected:**
- Both voice messages in same conversation
- No new conversation created on second recording
- Conversation ID remains consistent
- Browser console shows no errors

### 6. Workspace Switcher (Defect 5)
**Verify:**
1. Navigate to `/profile`
2. Verify workspaces list displayed
3. Create new workspace:
   - Enter name: "Test Workspace"
   - Enter description: "QA Test Workspace"
   - Click "+"
   - Verify workspace added to list

4. Switch workspaces:
   - Create 2 tasks in Workspace 1
   - Switch to "Test Workspace"
   - Verify task list is empty (scoped to new workspace)
   - Create 1 task in "Test Workspace"
   - Switch back to Workspace 1
   - Verify original 2 tasks visible

5. Verify workspace scope in:
   - `/tasks` page - tasks filtered by selected workspace
   - `/chat` page - conversations filtered by selected workspace
   - `/voice` page - new conversations created in selected workspace

**Expected:**
- Workspace selector in `/profile`
- Create/edit/delete workspaces
- All data (tasks, conversations) scoped to active workspace
- API calls include workspaceId parameter

### 7. Build & Deploy Verification
**Verify:**
```bash
curl -s http://localhost:3000/api/health
# Expected: {"ok":true,"service":"julie-ai-os","version":"0.1.0","gateway":{"connected":true...}}
```

```bash
curl -s https://julie.ijihost.com/ -o /dev/null -w "%{http_code}"
# Expected: 200

curl -s https://julie.ijihost.com/agents -o /dev/null -w "%{http_code}"
# Expected: 200 (login page)

curl -s https://julie.ijihost.com/terminal -o /dev/null -w "%{http_code}"
# Expected: 200 (login page)

curl -s https://julie.ijihost.com/tasks -o /dev/null -w "%{http_code}"
# Expected: 200 (login page)
```

### 8. Bundle Checks (Optional Advanced)
**Verify:**
- Open browser DevTools → Network tab
- Reload page
- Click on `index-*.js` bundle
- Search for: "TerminalPage", "BoardView", "AgentsPage"
- Verify all page components present in bundle

## Tools for Testing

### Browser DevTools
- **Console**: Check for JavaScript errors
- **Network**: Check API calls, WebSocket connections
- **Application**: Check cookies/session storage

### Command Line Tests
```bash
# Health check
curl -s http://localhost:3000/api/health

# Check WebSocket endpoint (use websocat or similar)
websocat wss://julie.ijihost.com/terminal-ws

# Test authenticated API (requires -b cookie)
curl -s -b "JULIE_SESSION=<cookie>" http://localhost:3000/api/agents

# Check file served over HTTPS
curl -s -I https://julie.ijihost.com/
```

## Reporting Format

For each test, report:

```
### Test: [Test Name]
- **Status**: ✅ PASS or ❌ FAIL
- **Evidence**: [Screenshots, curl output, console logs]
- **Notes**: [Any issues observed]
```

## Critical Blockers

Report immediately if:
- Any route returns 404 or 500
- JavaScript runtime errors prevent page load
- WebSocket fails to connect over HTTPS
- Authentication broken (can't login)
- Service crashes after restart

## Completion Checklist

- [ ] All SPA routes return 200
- [ ] Health check passes
- [ ] Terminal page renders and WebSocket works
- [ ] Agents page renders with proper CSS
- [ ] Task CRUD operations work
- [ ] Task cards show full details
- [ ] Bottom nav has exactly 5 items
- [ ] Voice messages reuse conversation
- [ ] Workspace switcher functional
- [ ] No console errors on page load
- [ ] Bundle contains all page components

---

*Start testing now. Report findings systematically.*
