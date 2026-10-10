import { describe, expect, it } from 'vitest';
import readme from '../packages/blob-avatar/README.md?raw';
import { propsSection } from '../scripts/props-table';

describe('the package README', () => {
  it('lists the props as the component declares them (npm run readme rewrites the table)', () => {
    expect(readme).toContain(propsSection());
  });
});
