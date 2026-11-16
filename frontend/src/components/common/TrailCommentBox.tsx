/**
 * Comment box shown under an approval trail.
 *
 * Comments go both ways: the requester can answer an approver and any approver
 * can add a note, at any stage. A comment becomes its own entry on the trail
 * and never changes the request's status.
 */
import React, { useState } from 'react';
import { Box, Button, CircularProgress, TextField, Typography } from '@mui/material';
import { Send as SendIcon } from '@mui/icons-material';
import { toast } from 'react-toastify';

const MAX_LENGTH = 2000;

interface Props {
  /** Saves the comment; should throw on failure. */
  onSubmit: (comment: string) => Promise<unknown>;
  /** Called after a successful save, to reload the trail. */
  onAdded: () => void;
}

const TrailCommentBox: React.FC<Props> = ({ onSubmit, onAdded }) => {
  const [comment, setComment] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSend = async () => {
    const text = comment.trim();
    if (!text) return;
    setSaving(true);
    try {
      await onSubmit(text);
      setComment('');
      toast.success('Comment added to the trail');
      onAdded();
    } catch (e: any) {
      toast.error(e?.response?.data?.error || 'Failed to add comment');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Box sx={{ mt: 2 }}>
      <Typography variant="subtitle2" gutterBottom>Add a comment</Typography>
      <TextField
        fullWidth
        multiline
        minRows={2}
        placeholder="Ask a question or reply to an approver. Everyone involved in this request is notified."
        value={comment}
        onChange={(e) => setComment(e.target.value.slice(0, MAX_LENGTH))}
        disabled={saving}
        helperText={`${comment.length}/${MAX_LENGTH}`}
      />
      <Box display="flex" justifyContent="flex-end" mt={1}>
        <Button
          variant="contained"
          size="small"
          startIcon={saving ? <CircularProgress size={16} color="inherit" /> : <SendIcon />}
          onClick={handleSend}
          disabled={saving || !comment.trim()}
        >
          Post Comment
        </Button>
      </Box>
    </Box>
  );
};

export default TrailCommentBox;
