# EXCEPTION//OS

Restaurant intelligence command center for recalling operational exceptions, dispatching specialist agents, recommending a playbook, and saving the manager outcome back to memory.

## Run in three commands

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open `http://localhost:3000`.

## Environment

`DEMO_MODE=mock` forces the fully deterministic demo. `DEMO_MODE=auto` uses XTrace only when `XTRACE_API_KEY`, `XTRACE_ORG_ID`, and `XTRACE_GROUP_ID` are present, then falls back to mock memory on timeout or error.

The installed `@xtraceai/memory` SDK version is `0.6.0`; its current `MemoryClient` constructor uses `apiKey` only. `XTRACE_ORG_ID` remains in `.env.example` because the hackathon contract asks for it, but it is not passed into the SDK.

OpenAI is optional. Set both `OPENAI_API_KEY` and `OPENAI_MODEL` to let the server refine rationale wording. Without both, the deterministic decision engine runs the full demo.

## Demo flow

1. Select an incident cartridge.
2. Press `RECALL TRACE`.
3. Review agent dispatch, strongest memories, confidence signals, and playbook.
4. Press `ACCEPT`, `OVERRIDE`, or `LOG OUTCOME`.
5. Press `RESET SCENARIO` to clear only the active cartridge's logged outcome.

Keyboard shortcuts: `1-6` switch cartridges, `R` recalls, `A` accepts, `L` logs outcome, and `X` resets.

## Implemented cartridges

- `01 SUPPLIER LOOP` uses failed supplier memory and successful fallback memory.
- `02 FRYER GHOST` shows a retired procedure and failed reuse after repair.
- `03 RUSH PROTOCOL` recalls recurring concert demand and the successful peak playbook.
- `04 ALLERGY LOCK` blocks an unsupported allergen modification and requires staff confirmation.
- `05 RECOVERY MODE` compares failed generic coupon recovery against a successful personal replacement.
- `06 WASTE WATCH` uses Tuesday prep waste and a checkpoint-batch procedure.
