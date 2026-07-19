# NameMasker Product Text

Site copy source of truth. Lives at docs/product-text.md in the repo.

Tagline (site header): "Mask before AI. Unmask after. Nothing leaves your
browser."

---

## Purpose

AI tools are genuinely useful for the work independent educational consultants do every day: tightening a recommendation letter, reacting to an essay draft, summarizing a transcript, brainstorming a college list. But that usefulness comes with a problem. The documents in front of you are full of a student's identity, and pasting them into ChatGPT, Claude, Gemini, or any other AI service means handing that identity to a third party.

NameMasker sits between your documents and the AI. It finds the identifying information, stages replacements for your review, and gives you a masked version that is safe to share. When the AI sends work back, NameMasker unmasks it, restoring the real names so you can use the result immediately.

Everything happens on your own device. Your documents never leave your browser. There is no account, no upload, and no server reading your files.

One promise we will not make: NameMasker does not "guarantee anonymity." No tool honestly can. What it does is catch what software can catch, flag what software can only suspect, and put you, the professional, in the approval seat for everything. You review before anything is shared. That review step is the product, not a disclaimer.

## How to use it

1. Open namemasker.com. It works in any modern browser. After your first visit it works offline.
2. Paste your text, or drop in a PDF or Word document.
3. Press Mask. Identifying information lights up in the text: names, schools, emails, phone numbers, and passages that might identify the student through context.
4. Review the highlights — click any one to approve, edit, or dismiss it. Caught something the scan missed? Select the text and press "Mask this," or keep an always-flag list of names the scan should never miss. You know the student; the tool does not.
5. Copy the masked text and use it with any AI service you like.
6. When you get results back, paste them in and press Unmask. Real names return everywhere the AI kept the placeholders.

If you work with the same student across a season, save the student's mapping file. Load it next session and the same student is always "Student A," across every document, so your AI conversations stay coherent over months.

## What it does: the experience

Say you have a recommendation letter for a student named Maya. You paste it in and press Mask. "Maya Chen" is highlighted with a proposed replacement, "Student A." Her school becomes "School 1." A phone number in the letterhead is flagged. A sentence describing her as "the first female wrestling captain at a small Quaker school outside Philadelphia" gets a yellow flag, because even without a name in it, that sentence may identify her, and only you can judge that.

You click through the highlights in a few seconds, adjust one, approve the rest, and copy the masked letter. You spend ten minutes with an AI improving it. You paste the improved letter back, press Unmask, and Maya's name is back in every spot. Total overhead: under a minute.

The highlights come in three kinds, and the distinction matters:

- Direct identifiers: emails, phone numbers, ID numbers, dates. Software catches these with near-perfect reliability.
- Names: people, schools, organizations, detected by a language model running on your device.
- Contextual flags: passages with no names that may still identify the student, like unusual achievements, rare activities, or narrow geographic details. NameMasker flags these for your judgment. It never masks them automatically, because whether "state fencing champion" is identifying depends on context only you have.

A document dense with contextual fragments gets a banner noting that the combination itself may be identifying, even after masking. Again: a flag for you, not a decision made for you.

## What it does: the technical explanation

NameMasker is a static web page. When you visit, your browser downloads the application code and a small language model (roughly 65MB, cached after the first visit). From that point, every step runs locally on your device:

- Pattern detection. Emails, phone numbers, ID numbers, and dates are found with deterministic rules. No AI involved, near-perfect accuracy.
- Name detection. A compact named-entity-recognition model runs inside your browser tab and tags people, organizations, and places. This is machine learning, but it is your machine doing the work. Nothing is sent anywhere.
- Contextual heuristics. A rule set scores combinations of signals: uniqueness claims, rare activities, narrow institutions, geographic detail. When signals stack within a passage, it gets a yellow flag with a stated reason. The rules are tuned to over-flag mildly, because a false alarm costs you a glance and a false miss costs a student their privacy.
- The map. Masked replacements are recorded in a small file on your device: real name on one side, placeholder on the other, plus aliases (so "Maya" and "Maya Chen" share one placeholder, and Unmask always restores the full name) and your always-flag list. This file is what makes Unmask work, and it is the only sensitive artifact the tool creates. It lives wherever your student files already live. It is never transmitted.
- Unmasking. Pure text substitution using the mapping, in reverse.

There is no backend. The site is static files on a web server, and the server never receives your text, your files, or your mapping. You can verify this yourself: open your browser's network inspector, or simply turn off your internet connection after the page loads and watch everything keep working.

The code is open source under the MIT license. Every rule, every model call, and every line between your document and your clipboard is public and auditable.

## FAQ

**Q: Isn't this just uploading identifiable information to an AI anyway?**

No, and the distinction is the whole point. The language model that detects names runs inside your browser, on your device, the same way a spell-checker does. It is a small, self-contained model file your browser downloads once and runs locally. Your text is never transmitted to it, because it is not "somewhere else." It is in the same browser tab as your document.

The AI services you should be cautious about are hosted ones: your text travels to a company's servers, where it may be logged, retained, or used in ways governed by terms of service you did not negotiate. NameMasker exists precisely so that what travels to those services is the masked version. The detection happens on your machine; the masked output is what leaves it, and only when you copy it yourself.

**Q: Give me examples of how to use it.**

- Recommendation letters. Mask a draft, ask an AI to tighten the prose, unmask the result, done. The most common case.
- Essay feedback. Use Essay mode, which is conservative: it masks direct identifiers but preserves the student's voice and story details for your review, because an over-masked essay is useless to evaluate. Expect more yellow flags here; essays are where contextual identification lives.
- Transcripts and score reports. Use Records mode, which is aggressive: names, birthdates, ID numbers, addresses, and school names are all staged. Then ask an AI to summarize trends or explain an unfamiliar grading system.
- Notes to external professionals. Mask your meeting notes before asking an AI to draft a summary for a tutor or specialist.
- Season-long work with one student. Save the student's mapping file. Every future document uses the same placeholders, so your AI assistant's context about "Student A" accumulates coherently across months.

**Q: How can I be sure I can trust it?**

First, a promise — from a person, not a company:

> I'm Chris Bell, an independent educational consultant. NameMasker is the
> same masking engine at the heart of the full IEC dashboard I'm building
> for my own practice — I use it with my own students, and it seemed too
> useful not to share with the IEC community.
>
> This site does not send your documents anywhere — not to me, not to a
> server, not to any AI company. Nothing you type or open here leaves your
> computer. And it's free, of course.
>
> — Chris

Here's how that can be true. NameMasker is a website, but it doesn't work
like one. A normal website sends what you type to a server; this page, once
loaded, sends nothing anywhere. Every step — finding names, masking them,
restoring them — happens in your browser, on your machine. There is no
server on the other end. There is nothing to send to.

Most of the work is deliberately old-fashioned: find and replace. "Maya
Chen" becomes "Student A" the same way your word processor would do it — no
cleverness, perfectly reversible. One part does use AI: finding the names.
It's a small language model your browser downloads once and runs by itself,
like a spell-checker. It reads your document on your computer, and nothing
is sent out to be read.

A promise is only worth what you can check. Four ways, easiest first:

1. Turn off your internet. Load the page, disconnect, and use the tool. It works fully offline because nothing it does requires a server. This is a two-minute test anyone can run.
2. Watch the network. Open your browser's developer tools, use the tool, and observe that no requests carry your text anywhere. The only network activity is the one-time download of the application and model.
3. Read the code. The entire tool is open source. If you write code, or know someone who does, the absence of any transmission is verifiable in the source.
4. Trust the incentives. This tool is free, has no accounts, collects no analytics on your documents, and is published under the name of a working IEC practice. Its only value is its credibility. A privacy tool that quietly phoned home would be worthless to its maker the day it was discovered, and the open code means it would be discovered.

And one trust question to keep pointed at us rather than the technology: no automated tool catches everything. NameMasker will miss things, especially contextual identification that requires knowing the student. That is why the review step exists and why the page will never tell you a document is "safe," only that it found what it found. The professional judgment is yours. The tool's job is to make exercising it fast.
