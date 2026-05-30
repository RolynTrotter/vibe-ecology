// Test entry point: import every *.test.mjs, then run the collected cases.
import { run } from './harness.mjs';
import './harvest.test.mjs';
import './world.test.mjs';
import './colony.test.mjs';
import './foodweb.test.mjs';
import './textures.test.mjs';
import './dev.test.mjs'; // last: mutates the global SPECIES roster

await run();
