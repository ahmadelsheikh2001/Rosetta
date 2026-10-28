# Mapping registry

One YAML file per source command, under `registry/<platform>/<package>/<command>.yaml`.
Schema: [`src/entry.ts`](../src/entry.ts). How to add one: [CONTRIBUTING.md](../../../CONTRIBUTING.md#adding-a-mapping).

Empty until the first corpus samples are analysed: package and command names are taken
from real exports only (ADR-017), never from memory.
