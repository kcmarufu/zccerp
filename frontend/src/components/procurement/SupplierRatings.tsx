/**
 * Supplier ratings
 *
 * Once a purchase request is approved for payment, the person who raised it
 * and the Procurement team each rate every supplier awarded part of it, on
 * quality and on delivery. A supplier's rating is the average of all of them.
 *
 *   SupplierRatingPanel  — on the purchase request page: rate, and see others' ratings
 *   VendorRatingsDialog  — from the vendor database: every rating a supplier has had
 *   RatingSummary        — stars, average and number of ratings
 */

import React, { useEffect, useState } from 'react';
import {
  Alert, Box, Button, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle,
  Divider, Paper, Rating, Stack, TextField, Tooltip, Typography
} from '@mui/material';
import { Star as StarIcon } from '@mui/icons-material';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-toastify';
import {
  getSupplierRatings, rateSupplier, getVendorById, SupplierRatingEntry
} from '../../services/procurementService';
import { formatDate } from '../../utils/datetime';

const RATEABLE_STATUSES = ['PENDING_PAYMENT', 'COMPLETED'];

const band = (value: number) => (value >= 4 ? 'Good' : value >= 2.5 ? 'Average' : 'Poor');
const raterLabel = (type: string) => (type === 'PROCUREMENT' ? 'Procurement' : 'Requester');

export const RatingSummary: React.FC<{ rating?: number | string | null; count?: number }> = ({ rating, count }) => {
  const value = Number(rating);
  if (!(value > 0)) return <Typography variant="caption" color="text.disabled">Not rated</Typography>;
  return (
    <Tooltip title={`${value.toFixed(1)} / 5 — ${band(value)}, from ${count || 0} rating${count === 1 ? '' : 's'}`}>
      <Box display="flex" alignItems="center" gap={0.5}>
        <Rating value={value} readOnly size="small" precision={0.5} />
        <Typography variant="caption" color="text.secondary">
          {value.toFixed(1)}{count ? ` (${count})` : ''}
        </Typography>
      </Box>
    </Tooltip>
  );
};

const RatingLine: React.FC<{ entry: SupplierRatingEntry; showRequest?: boolean }> = ({ entry, showRequest }) => (
  <Box sx={{ py: 1 }}>
    <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
      <Typography variant="body2" fontWeight={600}>{entry.rated_by_name}</Typography>
      <Chip size="small" variant="outlined" label={raterLabel(entry.rater_type)} />
      {showRequest && entry.request_code && (
        <Typography variant="caption" color="text.secondary">{entry.request_code}</Typography>
      )}
      <Typography variant="caption" color="text.secondary">{formatDate(entry.updated_at)}</Typography>
    </Stack>
    <Stack direction="row" spacing={2} sx={{ mt: 0.5 }} flexWrap="wrap" useFlexGap>
      <Box display="flex" alignItems="center" gap={0.5}>
        <Typography variant="caption" color="text.secondary">Quality</Typography>
        <Rating value={Number(entry.quality_rating)} readOnly size="small" />
      </Box>
      <Box display="flex" alignItems="center" gap={0.5}>
        <Typography variant="caption" color="text.secondary">Delivery</Typography>
        <Rating value={Number(entry.delivery_rating)} readOnly size="small" />
      </Box>
    </Stack>
    {entry.comment && <Typography variant="body2" sx={{ mt: 0.5 }}>{entry.comment}</Typography>}
  </Box>
);

/** One supplier on a purchase request: the user's own rating form, then everyone's ratings. */
const SupplierRow: React.FC<{
  requestId: number | string;
  canRate: boolean;
  supplier: Awaited<ReturnType<typeof getSupplierRatings>>['suppliers'][number];
}> = ({ requestId, canRate, supplier }) => {
  const qc = useQueryClient();
  const mine = supplier.my_rating;
  const [quality, setQuality] = useState<number | null>(mine?.quality_rating ?? null);
  const [delivery, setDelivery] = useState<number | null>(mine?.delivery_rating ?? null);
  const [comment, setComment] = useState(mine?.comment || '');
  const [editing, setEditing] = useState(!mine);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setQuality(mine?.quality_rating ?? null);
    setDelivery(mine?.delivery_rating ?? null);
    setComment(mine?.comment || '');
    setEditing(!mine);
  }, [mine]);

  const needsComment = (quality !== null && quality <= 2) || (delivery !== null && delivery <= 2);

  const save = async () => {
    if (!quality || !delivery) { toast.error('Give both quality and delivery a star rating'); return; }
    if (needsComment && !comment.trim()) { toast.error('Please say what went wrong when you give 2 stars or fewer'); return; }
    setSaving(true);
    try {
      await rateSupplier(requestId, supplier.vendor_id, { quality_rating: quality, delivery_rating: delivery, comment: comment.trim() || undefined });
      toast.success('Thank you — your rating has been saved');
      qc.invalidateQueries({ queryKey: ['proc-supplier-ratings', String(requestId)] });
      qc.invalidateQueries({ queryKey: ['proc-vendors'] });
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Could not save the rating');
    } finally {
      setSaving(false);
    }
  };

  const others = supplier.ratings.filter((r) => r !== mine && r.rated_by !== mine?.rated_by);

  return (
    <Box sx={{ py: 1.5 }}>
      <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap" useFlexGap>
        <Typography variant="subtitle1" fontWeight={700}>{supplier.company_name}</Typography>
        <RatingSummary rating={supplier.overall_rating} count={supplier.rating_count} />
      </Stack>

      {canRate && editing && (
        <Box sx={{ mt: 1, p: 1.5, borderRadius: 1, bgcolor: 'action.hover' }}>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={3}>
            <Box>
              <Typography variant="caption" color="text.secondary" display="block">Quality of goods / service</Typography>
              <Rating value={quality} onChange={(_, v) => setQuality(v)} />
            </Box>
            <Box>
              <Typography variant="caption" color="text.secondary" display="block">Delivery (on time, as agreed)</Typography>
              <Rating value={delivery} onChange={(_, v) => setDelivery(v)} />
            </Box>
          </Stack>
          <TextField
            fullWidth size="small" multiline minRows={2} sx={{ mt: 1 }}
            label={needsComment ? 'What went wrong? (required)' : 'Comment (optional)'}
            value={comment} onChange={(e) => setComment(e.target.value)}
            inputProps={{ maxLength: 1000 }}
          />
          <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
            <Button variant="contained" size="small" onClick={save} disabled={saving}
              startIcon={saving ? <CircularProgress size={14} /> : <StarIcon />}>
              {mine ? 'Update rating' : 'Save rating'}
            </Button>
            {mine && <Button size="small" onClick={() => setEditing(false)} disabled={saving}>Cancel</Button>}
          </Stack>
        </Box>
      )}

      {mine && !editing && (
        <Box sx={{ mt: 0.5 }}>
          <Stack direction="row" alignItems="center" spacing={1}>
            <Typography variant="caption" color="text.secondary">Your rating</Typography>
            {canRate && <Button size="small" onClick={() => setEditing(true)}>Change</Button>}
          </Stack>
          <RatingLine entry={mine} />
        </Box>
      )}

      {others.map((entry) => <RatingLine key={`${entry.rated_by}-${entry.updated_at}`} entry={entry} />)}
      {!mine && !others.length && !canRate && (
        <Typography variant="caption" color="text.secondary">No ratings yet for this purchase.</Typography>
      )}
    </Box>
  );
};

export const SupplierRatingPanel: React.FC<{ requestId: number | string; status?: string }> = ({ requestId, status }) => {
  const enabled = Boolean(status && RATEABLE_STATUSES.includes(status));
  const { data, isLoading } = useQuery({
    queryKey: ['proc-supplier-ratings', String(requestId)],
    queryFn: () => getSupplierRatings(requestId),
    enabled
  });
  if (!enabled) return null;
  if (isLoading) return <Paper sx={{ p: 2, mb: 2 }}><CircularProgress size={20} /></Paper>;
  if (!data || !data.suppliers.length) return null;
  const unrated = data.can_rate && data.suppliers.some((s) => !s.my_rating);

  return (
    <Paper sx={{ p: 2.5, mb: 2 }}>
      <Typography variant="h6" fontWeight={700}>Supplier rating</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
        The person who raised this request and the Procurement team each rate the supplier on quality and delivery.
        These ratings make up the supplier's rating in the vendor database.
      </Typography>
      {unrated && (
        <Alert severity="info" sx={{ mb: 1 }}>
          {data.rater_type === 'PROCUREMENT'
            ? 'Please rate how this supplier performed for Procurement.'
            : 'Once you have received the goods or service, please rate the supplier.'}
        </Alert>
      )}
      {data.suppliers.map((supplier, i) => (
        <React.Fragment key={supplier.vendor_id}>
          {i > 0 && <Divider />}
          <SupplierRow requestId={requestId} canRate={data.can_rate} supplier={supplier} />
        </React.Fragment>
      ))}
    </Paper>
  );
};

export const VendorRatingsDialog: React.FC<{ vendorId: number | null; onClose: () => void }> = ({ vendorId, onClose }) => {
  const { data, isLoading } = useQuery({
    queryKey: ['proc-vendor', vendorId],
    queryFn: () => getVendorById(vendorId as number),
    enabled: vendorId !== null
  });
  const ratings: SupplierRatingEntry[] = (data as any)?.ratings || [];
  return (
    <Dialog open={vendorId !== null} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        {data?.company_name || 'Supplier'} — ratings
        {data && <Box sx={{ mt: 0.5 }}><RatingSummary rating={data.rating} count={data.rating_count} /></Box>}
      </DialogTitle>
      <DialogContent dividers>
        {isLoading && <CircularProgress size={20} />}
        {!isLoading && !ratings.length && (
          <Typography variant="body2" color="text.secondary">
            Nobody has rated this supplier yet. Ratings are given on purchase requests once they are approved for payment.
          </Typography>
        )}
        {ratings.map((entry, i) => (
          <React.Fragment key={`${entry.request_id}-${entry.rated_by_name}-${i}`}>
            {i > 0 && <Divider />}
            <RatingLine entry={entry} showRequest />
          </React.Fragment>
        ))}
      </DialogContent>
      <DialogActions><Button onClick={onClose}>Close</Button></DialogActions>
    </Dialog>
  );
};
