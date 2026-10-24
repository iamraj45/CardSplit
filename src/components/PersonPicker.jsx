import { useState } from 'react';
import Autocomplete from '@mui/material/Autocomplete';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import PersonAddOutlined from '@mui/icons-material/PersonAddOutlined';

/**
 * Add someone to the reconciliation: pick a person saved on this device or type a new name.
 * Enter adds without submitting a surrounding form.
 */
export default function PersonPicker({ savedPeople, currentPeople, onAdd, label = 'Add person' }) {
  const [input, setInput] = useState('');
  const currentIds = new Set(currentPeople.map((p) => p.id));
  const options = savedPeople.filter((p) => !currentIds.has(p.id));

  const commit = (value) => {
    const person = typeof value === 'string' ? { name: value } : value;
    if (!person?.name?.trim()) return;
    onAdd(person);
    setInput('');
  };

  return (
    <Stack direction="row" spacing={1} sx={{ alignItems: 'flex-start' }}>
      <Autocomplete
        freeSolo
        options={options}
        getOptionLabel={(o) => (typeof o === 'string' ? o : o.name)}
        value={null}
        inputValue={input}
        onInputChange={(_, value, reason) => reason !== 'reset' && setInput(value)}
        onChange={(_, value) => commit(value)}
        onKeyDown={(e) => e.key === 'Enter' && e.preventDefault()}
        clearOnBlur={false}
        sx={{ flexGrow: 1, maxWidth: 320 }}
        renderInput={(params) => (
          <TextField {...params} size="small" label={label} placeholder={options.length ? 'Pick or type a name' : 'Type a name'} />
        )}
      />
      <Button
        variant="outlined"
        startIcon={<PersonAddOutlined />}
        onClick={() => commit(input)}
        disabled={!input.trim()}
        sx={{ whiteSpace: 'nowrap', height: 40 }}
      >
        Add
      </Button>
    </Stack>
  );
}
