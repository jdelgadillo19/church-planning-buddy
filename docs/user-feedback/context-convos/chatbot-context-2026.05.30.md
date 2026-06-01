````markdown
# Church Planning Buddy — Messaging Automation / Admin-in-the-Loop Chatbot Notes

## Context

I want Church Planning Buddy to become more than just a Get Ready Guide generator.

Long-term, I see it becoming a church operations toolbelt that can coordinate:

- Planning Center schedules
- weekly volunteer reminders
- Get Ready Guide generation
- WhatsApp community workflow support
- document/file delivery
- eventually ProPresenter presentation generation

The immediate idea is to build a messaging/chatbot module that can help manage weekly worship team communication.

---

# Original Goal

I already have a WhatsApp community:

Saddleback Berlin Worship Community

It has multiple subgroups, such as:

- Sunday Worship Team
- Music Team
- Production Team
- ProPresenter
- Announcements

Some groups are largely static:

- Announcements
- Music Team
- Production Team
- ProPresenter

Other groups are dynamic week by week:

- Sunday Worship Team

The Sunday Worship Team group should reflect whoever is confirmed for that week in Planning Center.

The original dream was:

1. Bot reads Planning Center.
2. Bot checks who is confirmed for a given Sunday.
3. Bot updates the WhatsApp Sunday Worship Team subgroup by adding/removing members.
4. Bot sends scheduled messages like:
   - first weekly sign-up prompt
   - second weekly sign-up prompt
   - individual nudges to unconfirmed invitees
   - Get Ready Guide
   - call-time reminders
5. Out-of-MVP: team members could message the bot asking for documents, and the bot would send the correct Planning Center/Google Drive document.
6. Out-of-MVP: Google Calendar integration.
7. Later: ProPresenter generation based on Planning Center plans.

---

# Important Constraint

The hard part is WhatsApp group automation.

Official WhatsApp Business APIs are mainly designed for business-to-user direct messaging. They are not really designed to:

- join an existing WhatsApp community as a bot
- read normal WhatsApp group membership
- add/remove people from existing community subgroups
- post freely into arbitrary WhatsApp community subgroups
- act like a Discord/Slack bot inside a group

Unofficial WhatsApp Web automation libraries may exist, but they are brittle, can break when WhatsApp changes, may get accounts restricted, and are probably not a good foundation for a serious church operations tool.

Therefore, the MVP should avoid attempting automated WhatsApp group administration.

---

# Better Product Pattern: Admin-in-the-Loop Automation

The better compromise is:

Automate the thinking.
Keep the human in charge of the risky/manual platform action.
Trigger the next automation after human confirmation.

In this case:

```txt
Planning Center schedule changes
↓
Church Planning Buddy checks confirmed/pending people
↓
Bot texts me an admin checklist
↓
I manually update the WhatsApp subgroup
↓
I reply to the bot: DONE
↓
Bot sends/prepares the Get Ready Guide
````

This avoids risky WhatsApp automation while still solving most of the real operational burden.

---

# Proposed MVP Workflow

## Weekly Sunday Worship Team Admin Workflow

Example:

```txt
Friday 12:00
Bot texts Jesse:

Sunday Worship Team update for June 2:

Add:
- Anna Müller
- David Kim
- Sofia Reyes

Remove:
- Mark Weber
- Lucas Schmidt

Confirmed team:
- Anna Müller
- David Kim
- Sofia Reyes
- ...

Still unconfirmed:
- Ben Fischer
- Rachel Lee

Reply:
DONE = mark WhatsApp group as updated
PREVIEW = preview Get Ready Guide message
SEND = send or queue the Get Ready Guide
SKIP = skip this week
NUDGE = text unconfirmed people
STATUS = show current workflow status
```

Then I manually update the WhatsApp group.

Then I text:

```txt
DONE
```

Bot responds:

```txt
Great — WhatsApp group update marked complete.
Here is the Get Ready Guide message to paste into WhatsApp:
...
```

Or, depending on configuration:

```txt
Great — sending the Get Ready Guide to confirmed team members now.
```

---

# MVP Scope

The MVP should NOT automate WhatsApp group admin.

Instead, the MVP should:

1. Read Planning Center data.
2. Resolve the upcoming Sunday team roster.
3. Identify:

   * confirmed people
   * unconfirmed invitees
   * declined people
   * people to add to the Sunday WhatsApp group
   * people to remove from the Sunday WhatsApp group
4. Text an admin checklist to me.
5. Wait for my SMS reply.
6. Respond to commands:

   * DONE
   * PREVIEW
   * SEND
   * SKIP
   * NUDGE
   * STATUS
7. After DONE or SEND, prepare/send the Get Ready Guide message.
8. Log all outbound and inbound messages.
9. Use SMS first, probably via Twilio.
10. Keep WhatsApp integration as placeholder/future provider only.

---

# Recommended Design Principle

Separate three message contexts:

## 1. Admin Channel

Messages to the admin.

Examples:

* weekly checklist
* DONE confirmation
* status updates
* preview messages
* error messages

## 2. Team Channel

Messages to volunteers.

Examples:

* sign-up prompt
* confirmation reminder
* individual nudge
* Get Ready Guide link
* call-time reminder

## 3. WhatsApp Paste Channel

Copy/paste-ready messages generated for the admin to manually paste into WhatsApp.

Example:

```txt
Hey team! Here’s this week’s Get Ready Guide:
{{get_ready_guide_url}}

Please review before rehearsal. See you Sunday!
```

---

# Dynamic Groups

Church Planning Buddy should support dynamic groups based on Planning Center data.

Example dynamic groups:

```txt
Confirmed Sunday Worship Team
= people assigned to upcoming Sunday’s plan
+ team is Music/Production/ProPresenter
+ status is confirmed
```

```txt
Unconfirmed Sunday Worship Team
= people assigned to upcoming Sunday’s plan
+ status is pending/unconfirmed
```

```txt
Confirmed Music Team
= confirmed people in music-related teams
```

```txt
Confirmed Tech Team
= confirmed people in Production/ProPresenter teams
```

---

# Static Groups

Some groups are mostly static and can be manually maintained:

* Music Team
* Production Team
* ProPresenter
* Announcements

These can be stored as manual groups in Church Planning Buddy.

---

# Manual WhatsApp Roster Snapshot

Because the bot cannot reliably read WhatsApp group membership officially, the app should store a manually maintained roster snapshot for the WhatsApp Sunday Worship Team group.

The system can compare:

```txt
Planning Center confirmed roster
vs.
stored WhatsApp roster snapshot
```

Then it generates:

```txt
Add:
- people confirmed in PCO but not in WhatsApp roster snapshot

Remove:
- people in WhatsApp roster snapshot but not confirmed in PCO
```

After I manually update WhatsApp and reply DONE, the app can update the stored roster snapshot to match the latest confirmed roster.

---

# State Machine

This workflow should be implemented as a state machine, not as loose cron scripts.

Possible states:

```txt
pending_checklist
awaiting_admin_confirmation
admin_confirmed
guide_previewed
guide_sent
skipped
failed
```

Example flow:

```txt
scheduled workflow starts
↓
pending_checklist
↓
send admin checklist
↓
awaiting_admin_confirmation
↓
admin replies DONE
↓
admin_confirmed
↓
send/prepare Get Ready Guide
↓
guide_sent
```

---

# SMS Commands

The admin bot should support a minimal command system.

## DONE

Marks the active manual task complete.

Use case:

```txt
DONE
```

Meaning:

```txt
I manually updated the WhatsApp group.
Proceed with the next step.
```

## PREVIEW

Sends a preview of the Get Ready Guide message before sending/preparing it.

## SEND

Sends or queues the Get Ready Guide message, depending on configuration.

## SKIP

Cancels this week’s workflow.

## NUDGE

Sends individual SMS nudges to unconfirmed invitees.

Example volunteer nudge:

```txt
Hey {{first_name}}, could you confirm or decline for this Sunday in Planning Center when you get a chance?
{{plan_url}}
```

## STATUS

Returns the current workflow status.

Example:

```txt
Sunday Worship Team workflow for June 2:
Status: awaiting_admin_confirmation
Checklist sent: Friday 12:00
Unconfirmed: 2
Guide sent: no
```

---

# Suggested Data Models

## contacts

```txt
id
name
first_name
last_name
phone
email
planning_center_person_id
sms_opt_in
active
created_at
updated_at
```

## manual_groups

```txt
id
name
description
created_at
updated_at
```

## manual_group_members

```txt
id
group_id
contact_id
created_at
updated_at
```

## dynamic_groups

```txt
id
name
source
config_json
created_at
updated_at
```

Example `config_json`:

```json
{
  "source": "planning_center",
  "service_type_id": "123",
  "team_ids": ["456", "789"],
  "status": "confirmed",
  "date_window": "upcoming_sunday"
}
```

## roster_snapshots

Used for manually maintained WhatsApp group rosters.

```txt
id
name
group_name
source_type
members_json
created_at
updated_at
```

Example:

```json
{
  "group_name": "Sunday Worship Team WhatsApp",
  "members": [
    {
      "contact_id": "abc",
      "name": "Anna Müller",
      "phone": "+491234567"
    }
  ]
}
```

## message_templates

```txt
id
name
body
category
created_at
updated_at
```

Template variables should include:

```txt
{{first_name}}
{{full_name}}
{{service_date}}
{{team_name}}
{{plan_url}}
{{get_ready_guide_url}}
{{call_time}}
{{rehearsal_time}}
{{setlist}}
```

## scheduled_messages

```txt
id
name
template_id
audience_type
audience_config_json
recurrence_rule
timezone
enabled
last_sent_at
next_send_at
created_at
updated_at
```

## messaging_workflows

```txt
id
name
description
enabled
trigger_config_json
source_config_json
created_at
updated_at
```

## messaging_workflow_runs

```txt
id
workflow_id
planning_center_plan_id
status
started_at
completed_at
skipped_at
error_message
created_at
updated_at
```

## manual_action_tasks

```txt
id
workflow_run_id
action_type
status
assigned_to_contact_id
checklist_json
created_at
due_at
completed_at
completed_by_contact_id
confirmation_message_id
```

Example `checklist_json`:

```json
{
  "group_name": "Sunday Worship Team",
  "service_date": "2026-06-02",
  "add": ["Anna Müller", "David Kim"],
  "remove": ["Lucas Schmidt"],
  "confirmed": ["Anna Müller", "David Kim", "Sofia Reyes"],
  "unconfirmed": ["Ben Fischer", "Rachel Lee"]
}
```

## message_logs

```txt
id
contact_id
group_id
workflow_run_id
template_id
direction
channel
body
provider
provider_message_id
status
sent_at
created_at
updated_at
```

## inbound_messages

```txt
id
from_phone
contact_id
body
provider
provider_message_id
received_at
handled
created_at
updated_at
```

## admin_command_messages

```txt
id
inbound_message_id
command
workflow_run_id
manual_action_task_id
status
result_json
created_at
updated_at
```

## provider_accounts

```txt
id
provider
name
config_json
active
created_at
updated_at
```

---

# Messaging Provider Abstraction

Messaging code should be isolated behind a provider abstraction.

Initial provider:

* Twilio SMS

Future providers:

* WhatsApp direct messages
* Email
* Discord
* Slack
* GroupMe
* Telegram

Interface idea:

```ts
sendMessage({
  to,
  body,
  channel,
  provider,
  metadata
})
```

Inbound webhook should normalize incoming messages into a common shape:

```ts
{
  from,
  to,
  body,
  provider,
  providerMessageId,
  receivedAt
}
```

---

# Twilio SMS Setup

Use Twilio SMS for MVP.

Environment variables:

```txt
TWILIO_ACCOUNT_SID
TWILIO_AUTH_TOKEN
TWILIO_PHONE_NUMBER
```

For local development:

```txt
localhost app
↓
ngrok public URL
↓
Twilio webhook
↓
/api/twilio/inbound
```

Twilio should handle:

* outbound SMS
* inbound SMS
* admin command replies
* volunteer replies
* message delivery logs if desired

---

# Planning Center Integration

Planning Center is the source of truth for:

* upcoming plans
* service dates
* assigned people
* teams
* confirmation status
* plan URLs
* maybe files/documents later

The first Planning Center integration should support:

```txt
Fetch upcoming Sunday plan
Fetch team members assigned to plan
Read confirmation status
Read team/role names
Map PCO people to contacts
Generate dynamic groups
```

---

# Get Ready Guide Integration

The messaging module should be able to trigger or reference the Get Ready Guide.

MVP options:

1. Link to an already generated guide.
2. Use a placeholder guide link.
3. Trigger existing Get Ready Guide generation flow.
4. Send copy/paste-ready WhatsApp message to admin.

Example message:

```txt
Hey team! Here’s this week’s Get Ready Guide:
{{get_ready_guide_url}}

Please review before rehearsal. See you Sunday!
```

---

# Out-of-MVP: Document Request Bot

Later, volunteers could text the bot commands like:

```txt
GUIDE
SETLIST
CHARTS
LYRICS
PLAN
CALLTIME
HELP
```

The bot would respond with the appropriate link.

Examples:

```txt
GUIDE
```

Response:

```txt
Here’s this week’s Get Ready Guide:
{{get_ready_guide_url}}
```

```txt
CALLTIME
```

Response:

```txt
Call time this Sunday is 8:15 AM.
```

This should start as command-based, not AI-based.

Natural language can come later.

---

# Out-of-MVP: Google Calendar Integration

Later, Google Calendar could be used to:

* trigger workflows based on events
* read rehearsal/service dates
* schedule reminders
* coordinate blackout dates
* create calendar events for teams

But this is not MVP.

---

# Out-of-MVP: ProPresenter Module

Long-term, Church Planning Buddy could generate ProPresenter presentations.

Possible flow:

```txt
Planning Center plan
↓
Read songs / service elements
↓
Resolve arrangements
↓
Find lyrics/source files
↓
Apply church-specific formatting standards
↓
Generate ProPresenter-ready presentation/package
↓
Eventually use ProPresenter local API where possible
```

This should be a separate module, but share the same underlying connectors:

* Planning Center
* Google Drive/source files
* configurable standards
* logging
* admin UI

---

# Best MVP Definition

The best MVP is:

```txt
Church Planning Buddy can send an admin-in-the-loop weekly SMS workflow based on Planning Center team confirmation data.
```

More specifically:

```txt
Given an upcoming Planning Center plan,
Church Planning Buddy can identify confirmed and unconfirmed team members,
compare the confirmed roster against a manually maintained WhatsApp roster snapshot,
text the admin a checklist of who to add/remove,
wait for the admin to reply DONE/SKIP/NUDGE/PREVIEW/STATUS,
and then prepare or send the Get Ready Guide message.
```

---

# What NOT To Build in MVP

Do not build:

* automated WhatsApp group membership management
* WhatsApp Web scraping
* unofficial WhatsApp bot admin actions
* general AI chatbot behavior
* Google Calendar integration
* ProPresenter generation
* complex document request intelligence
* multi-provider messaging beyond SMS
* volunteer-facing natural language AI

---

# Cursor Implementation Prompt

Use this as the main implementation prompt:

```txt
Update church-planning-buddy with a new Messaging Automation module using an admin-in-the-loop workflow.

Product goal:
Church Planning Buddy should become a modular ministry operations toolbelt. This module should support weekly communication workflows based on Planning Center schedules. For WhatsApp communities, the app should not attempt to automatically add/remove group members. Instead, it should generate an admin checklist, text it to the responsible admin, wait for confirmation, and then continue the workflow.

MVP workflow:
1. On a configured weekly schedule, fetch the upcoming Planning Center plan.
2. Resolve the dynamic team roster based on selected teams and confirmation status.
3. Compare the resolved confirmed roster against a manually maintained roster snapshot for the WhatsApp subgroup.
4. Generate an admin checklist:
   - people to add
   - people to remove
   - confirmed people
   - unconfirmed invitees
5. Send that checklist to the configured admin by SMS.
6. Save a manual_action_task with status awaiting_confirmation.
7. Allow the admin to reply by SMS:
   - DONE: mark task complete and trigger the next configured action
   - PREVIEW: send a preview of the Get Ready Guide message
   - SEND: send or queue the Get Ready Guide message
   - SKIP: cancel this week’s workflow
   - NUDGE: send individual SMS nudges to unconfirmed invitees
   - STATUS: return current workflow status
8. After DONE or SEND, generate or prepare the Get Ready Guide message.
9. MVP should either:
   - send the Get Ready Guide directly to confirmed team members by SMS, or
   - send the admin a copy/paste-ready WhatsApp message.
10. Do not implement unofficial WhatsApp automation in MVP.

Add/modify data models:
- contacts
- manual_groups
- manual_group_members
- dynamic_groups
- roster_snapshots
- message_templates
- scheduled_messages
- messaging_workflows
- messaging_workflow_runs
- manual_action_tasks
- message_logs
- inbound_messages
- admin_command_messages
- provider_accounts

manual_action_tasks should include:
- id
- workflow_run_id
- action_type
- status
- assigned_to_contact_id
- checklist_json
- created_at
- due_at
- completed_at
- completed_by_contact_id
- confirmation_message_id

messaging_workflow_runs should include:
- id
- workflow_id
- planning_center_plan_id
- status
- started_at
- completed_at
- skipped_at
- error_message

roster_snapshots should allow a human-maintained WhatsApp group roster to be stored and compared against Planning Center’s confirmed roster.

Messaging provider requirements:
- Use Twilio SMS for MVP.
- Use environment variables for:
  - TWILIO_ACCOUNT_SID
  - TWILIO_AUTH_TOKEN
  - TWILIO_PHONE_NUMBER
- Keep Twilio code isolated in a provider module.
- Create a general messaging provider abstraction so future providers can include WhatsApp direct messages, email, Discord, Slack, GroupMe, or Telegram.

Admin UI requirements:
- Contacts
- Manual Groups
- Dynamic Groups
- Roster Snapshots
- Message Templates
- Messaging Workflows
- Workflow Runs
- Manual Action Tasks
- Message Logs
- Inbound Messages

Planning Center requirements:
- Fetch upcoming plans.
- Fetch assigned team members.
- Read confirmation status.
- Support dynamic group filters:
  - service type
  - plan/date window
  - teams
  - role filters
  - status filter: confirmed, unconfirmed, declined, all

Template variables:
- {{first_name}}
- {{full_name}}
- {{service_date}}
- {{team_name}}
- {{plan_url}}
- {{get_ready_guide_url}}
- {{call_time}}
- {{rehearsal_time}}
- {{setlist}}

Implementation constraints:
- Keep WhatsApp integration as a placeholder provider only.
- Do not automate WhatsApp group admin actions in MVP.
- Build the workflow as a state machine, not a loose cron script.
- Include logs for every outbound and inbound message.
- Include a dry-run preview mode.
- Include README setup instructions for local development with ngrok and Twilio.
- Do not hardcode Saddleback Berlin-specific group names except in seed/demo data.
- Design the module so later integrations can support Google Calendar, Google Drive document lookup, and ProPresenter generation.
```

---

# Summary

The strongest direction is:

```txt
Church Planning Buddy becomes the source-of-truth ministry automation layer.
WhatsApp remains the human community layer.
SMS is used for reliable admin confirmations and volunteer nudges.
Planning Center remains the schedule/roster source of truth.
The system avoids fragile WhatsApp automation by using admin-in-the-loop workflows.
```

This is much more buildable than a true WhatsApp admin bot, while still delivering most of the real value.

```
```
