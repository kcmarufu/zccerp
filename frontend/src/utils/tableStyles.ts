/**
 * Shared styles for the wide data tables across the app.
 *
 * WHY THIS EXISTS
 * ---------------
 * The list tables (approvals, reconciliations, purchase requests, procurement
 * approvals, projects, partners) carry enough columns to overflow the viewport.
 * The Actions column sits last, so reaching an approve/reject/view icon meant
 * scrolling the table sideways — often by dragging a horizontal scrollbar that
 * was itself off the bottom of the screen. Users had to hunt for the controls
 * they use most on every single row.
 *
 * Pinning the Actions column to the right edge fixes that outright: the icons
 * stay on screen no matter how far the rest of the table is scrolled, and no
 * data has to be hidden or truncated to make room.
 *
 * USAGE
 *   <TableCell sx={{ ...stickyActionHeadCell('grey.100') }} align="center">Actions</TableCell>
 *   ...
 *   <TableCell align="center" sx={{ ...stickyActionCell() }}>{icons}</TableCell>
 *
 * The header background must be passed in because these tables do not share
 * one — some use grey.50/grey.100, others a solid brand colour. A sticky cell
 * has to be opaque, otherwise the columns sliding underneath show through it.
 */

import type { Theme } from '@mui/material/styles';
import type { SystemStyleObject } from '@mui/system';

/** Soft edge that signals the column is floating above scrolled content. */
const EDGE_SHADOW = '-6px 0 6px -6px rgba(0, 0, 0, 0.3)';

/**
 * Body cell of the Actions column.
 *
 * `background` defaults to the paper colour. Because the cell is opaque it
 * cannot inherit the row's hover tint, so an equivalent opaque tint is applied
 * on hover to keep the row reading as a single highlighted strip.
 */
export const stickyActionCell = (
  background: string = 'background.paper'
): SystemStyleObject<Theme> => ({
  position: 'sticky',
  right: 0,
  zIndex: 2,
  backgroundColor: background,
  boxShadow: EDGE_SHADOW,
  '.MuiTableRow-root:hover &': {
    backgroundColor: 'grey.100'
  }
});

/**
 * Header cell of the Actions column.
 *
 * Sits one layer above the body cells so that a vertically scrolled row never
 * appears through the header.
 */
export const stickyActionHeadCell = (
  background: string
): SystemStyleObject<Theme> => ({
  position: 'sticky',
  right: 0,
  zIndex: 3,
  backgroundColor: background,
  boxShadow: EDGE_SHADOW
});

/**
 * Table that fits the width it is given instead of forcing a sideways scroll.
 *
 * WHY: the detail tables inside the review/view dialogs are laid out by the
 * browser's automatic algorithm, which sizes every column to its widest cell
 * and never wraps. A single long line-item description or budget-line name
 * therefore pushed the table past the dialog and reviewers had to scroll
 * horizontally to read the amounts they were being asked to approve — the one
 * thing that has to be visible at a glance.
 *
 * Fixing the layout makes the declared column widths authoritative, and the
 * cell rules below let long text wrap down instead of out. Numeric columns are
 * kept on one line so figures are never split across two rows.
 *
 * USAGE
 *   <Table size="small" sx={fitTable}>
 *     <TableCell sx={{ width: '30%' }}>Description</TableCell>       // wraps
 *     <TableCell sx={numericCell} align="right">Actual</TableCell>   // never wraps
 */
export const fitTable: SystemStyleObject<Theme> = {
  tableLayout: 'fixed',
  width: '100%',
  '& td, & th': {
    whiteSpace: 'normal',
    overflowWrap: 'anywhere',
    verticalAlign: 'top'
  }
};

/** Column of figures inside a `fitTable`: wrapping a number would misread. */
export const numericCell: SystemStyleObject<Theme> = {
  whiteSpace: 'nowrap',
  overflowWrap: 'normal'
};
