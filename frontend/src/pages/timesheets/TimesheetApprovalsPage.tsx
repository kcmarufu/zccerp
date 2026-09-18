/**
 * Timesheet Approvals
 *
 * Everything currently waiting on the signed-in user, whichever period it
 * belongs to. The routing that decides "waiting on whom" lives on the server
 * (timesheetApproval.service.js):
 *
 *   General user  -> their Department Lead
 *   Lead          -> their Head of Department
 *   Head          -> Super Admin
 *
 * Approving from here is deliberately limited to Approve; rejecting or
 * returning needs a reason, and the reason belongs next to the hours, so those
 * open the timesheet itself.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box, Paper, Typography, Button, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Stack, CircularProgress, Chip, Tooltip, Alert,
  ToggleButton, ToggleButtonGroup,
} from '@mui/material';
import {
  OpenInNew as OpenIcon, Check as ApproveIcon, AssignmentTurnedIn as QueueIcon,
} from '@mui/icons-material';
import { toast } from 'react-toastify';

import { useAuthStore } from '../../store/authStore';
import { TimesheetApprovalQueueRow } from '../../types';
import { getApprovalQueue, actOnTimesheet } from '../../services/timesheetService';
import { hasOrgTimesheetAccess } from '../../utils/timesheetAccess';
import TimesheetStatusChip, { MONTHS } from '../../components/timesheets/TimesheetStatusChip';
import { formatDate } from '../../utils/datetime';
import { formatRoleLabel } from '../../utils/roleUtils';

const TimesheetApprovalsPage: React.FC = () => {
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const isOrgLevel = hasOrgTimesheetAccess(user);

  const [scope, setScope] = useState<'all' | 'department'>(isOrgLevel ? 'department' : 'all');
  const [rows, setRows] = useState<TimesheetApprovalQueueRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setRows(await getApprovalQueue(scope));
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Failed to load the approval queue');
    } finally {
      setLoading(false);
    }
  }, [scope]);

  useEffect(() => { load(); }, [load]);

  const approve = async (row: TimesheetApprovalQueueRow) => {
    try {
      setActing(row.id);
      await actOnTimesheet(row.id, 'APPROVE');
      toast.success(`${row.employee_name}'s timesheet approved and locked`);
      await load();
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Failed to approve');
    } finally {
      setActing(null);
    }
  };

  return (
    <Box>
      <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between"
        alignItems={{ sm: 'center' }} spacing={2} mb={3}>
        <Box>
          <Typography variant="h5" fontWeight={600}>Timesheet Approvals</Typography>
          <Typography variant="body2" color="text.secondary">
            Timesheets waiting on you
          </Typography>
        </Box>
        {isOrgLevel && (
          <ToggleButtonGroup size="small" exclusive value={scope}
            onChange={(_, v) => v && setScope(v)}>
            <ToggleButton value="department">My department</ToggleButton>
            <ToggleButton value="all">Whole organisation</ToggleButton>
          </ToggleButtonGroup>
        )}
      </Stack>

      {isOrgLevel && scope === 'all' && (
        <Alert severity="info" sx={{ mb: 2 }}>
          Showing every pending timesheet in the organisation. Approving one outside your own
          department stands in for its Lead or Head — the trail records that it was you.
        </Alert>
      )}

      <Paper variant="outlined">
        {loading ? (
          <Box display="flex" justifyContent="center" py={6}><CircularProgress /></Box>
        ) : rows.length === 0 ? (
          <Box textAlign="center" py={6}>
            <QueueIcon sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }} />
            <Typography color="text.secondary">Nothing is waiting on you.</Typography>
          </Box>
        ) : (
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow sx={{ bgcolor: 'grey.100' }}>
                  <TableCell sx={{ fontWeight: 700 }}>Employee</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Department</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Period</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Status</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700 }}>Expected</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700 }}>Actual</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700 }}>Completion</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Submitted</TableCell>
                  <TableCell align="center" sx={{ fontWeight: 700 }}>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.map((r) => {
                  const completion = Number(r.expected_hours) > 0
                    ? (Number(r.total_hours) / Number(r.expected_hours)) * 100 : 0;
                  return (
                    <TableRow key={r.id} hover>
                      <TableCell>
                        <Typography variant="body2" fontWeight={600}>{r.employee_name}</Typography>
                        <Typography variant="caption" color="text.secondary">
                          {r.position_title || formatRoleLabel(r.employee_role)}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="caption">{r.department_name || '—'}</Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2">
                          {MONTHS[r.month - 1]} {r.year}
                        </Typography>
                      </TableCell>
                      <TableCell><TimesheetStatusChip status={r.status} /></TableCell>
                      <TableCell align="right">{Number(r.expected_hours).toFixed(1)}</TableCell>
                      <TableCell align="right">{Number(r.total_hours).toFixed(1)}</TableCell>
                      <TableCell align="right">
                        <Chip size="small"
                          color={completion >= 99 ? 'success' : completion >= 80 ? 'warning' : 'error'}
                          label={`${completion.toFixed(0)}%`} />
                      </TableCell>
                      <TableCell>
                        <Typography variant="caption">
                          {r.submitted_at ? formatDate(r.submitted_at) : '—'}
                        </Typography>
                      </TableCell>
                      <TableCell align="center">
                        <Stack direction="row" spacing={1} justifyContent="center">
                          <Tooltip title="Open to review the hours, or to reject / return with a reason">
                            <Button size="small" startIcon={<OpenIcon />}
                              onClick={() => navigate(`/timesheets/${r.id}`)}>
                              Review
                            </Button>
                          </Tooltip>
                          <Button size="small" variant="contained" color="success"
                            startIcon={<ApproveIcon />} disabled={acting === r.id}
                            onClick={() => approve(r)}>
                            Approve
                          </Button>
                        </Stack>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Paper>
    </Box>
  );
};

export default TimesheetApprovalsPage;
