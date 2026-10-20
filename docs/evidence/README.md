# Coordinator E2E evidence

Commit bd3a599, harness c6d23c7, Inkdrop 6.2.0 relaunched with the rebuilt lib (2026-10-20). Runs executed by the coordinator, not by a worker.

```
direct: RESULT 8 passed, 0 failed, 5 skipped
drop:   RESULT 12 passed, 0 failed, 1 skipped
```

Full outputs: coordinator-e2e-bd3a599-direct.txt, coordinator-e2e-bd3a599-drop.txt.

## 323de03 (bug fixes from the astra review)

```
direct: RESULT 8 passed, 0 failed, 5 skipped
drop:   RESULT 11 passed, 1 failed, 1 skipped  (note-list failed only because no note list was shown in the live app; it passed in isolation once a list was shown, and the harness now shows one itself)
```

Full outputs: coordinator-e2e-323de03-direct.txt, coordinator-e2e-323de03-drop.txt.
