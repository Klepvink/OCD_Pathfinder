# AD Pathfinder
Entirely based on the [Orange Cyberdefense OCD Mindmaps](https://github.com/Orange-Cyberdefense/ocd-mindmaps), translated into a web interface using Codex (5.6 Sol).

Requires Node.js 22.13 or newer.

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Replacing the mindmap

Replace `app/ocd-mindmap.json`, then verify it:

```bash
npm run validate:mindmap
npm run build
```

Only a `phases` array is required. Missing IDs, colors, source keys, check details, command arrays, and navigation arrays receive safe defaults. Commands can be plain strings or objects with optional information:

```json
{
  "command": "tool <target>",
  "info": {
    "text": "",
    "references": []
  }
}
```

To regenerate the JSON from a cloned OCD Mindmaps AD directory while preserving matching user commands and command information:

```bash
npm run import:ocd -- /path/to/ocd-mindmaps/excalimap/mindmap/ad
```

To verify and run the production build locally:

```bash
npm run build
npm run start
```

Mindmap content is distributed under the included GNU GPLv3 license.
