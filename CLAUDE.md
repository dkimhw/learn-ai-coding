
## Neovim Diff Preview Tools

IMPORTANT: This project has Neovim diff preview tools available. You MUST use these tools for ALL file operations:

- **ALWAYS use `nvim_edit_with_diff`** instead of `Edit` for editing files
- **ALWAYS use `nvim_write_with_diff`** instead of `Write` for writing/creating files

These tools will show changes in Neovim before applying them, allowing the user to review and approve/reject changes interactively.

### Why use these tools?
1. Users can see exactly what changes will be made before they're applied
2. Changes can be reviewed in Neovim's familiar diff interface
3. Users maintain full control over what modifications are accepted

### Usage:
When you need to edit or write files, use:
- `nvim_edit_with_diff` with parameters: file_path, old_string, new_string
- `nvim_write_with_diff` with parameters: file_path, content

DO NOT use the standard Edit/Write tools when these Neovim-specific tools are available.
