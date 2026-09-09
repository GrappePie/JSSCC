# Studio 1/32 paint fix

When the grid snap changes, the default paint duration now follows the grid if it was previously following the old snap. This prevents a `1/32` grid from creating default `1/16` notes that visually span two cells and make drag-paint appear to skip every other cell.

Examples:

- `1/16` grid + default `1/16` duration → switch to `1/32` → duration becomes `1/32`.
- `1/32` grid + default `1/32` duration → switch to `1/16` → duration becomes `1/16`.
- Explicitly selected longer duration (for example `1/8`) is preserved when switching to a finer grid.

Browser regression coverage verifies adjacent `1/32` cells can be painted independently.
