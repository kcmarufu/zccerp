# Finance Module - ERP System

A comprehensive procurement and budget tracking system with a 4-tier approval workflow built using React (TypeScript) for the frontend and Node.js/Express with MySQL for the backend.

## Features

### Core Functionality
- **Request Management**: Create, edit, and submit procurement requests
- **4-Tier Approval Workflow**: General User → Program Lead → Head of Programs → Finance Clerk
- **Budget Management**: Track budget lines with real-time balance updates
- **Dispatch Management**: Handle approved requests and generate dispatch documents
- **Export Capability**: Generate PDF and Excel documents for approved requests

### Security Features
- **Role-Based Access Control (RBAC)**: 4 distinct roles with specific permissions
- **JWT Authentication**: Secure token-based authentication with refresh tokens
- **Race Condition Prevention**: SERIALIZABLE transactions, row-level locking, optimistic locking
- **Input Validation**: Server-side validation with express-validator
- **Rate Limiting**: Protect against brute-force attacks

## User Roles

| Role | Permissions |
|------|-------------|
| **GENERAL_USER** | Create requests, view own requests |
| **PROGRAM_LEAD** | All user permissions + approve department requests |
| **HEAD_OF_PROGRAMS** | All lead permissions + approve all requests |
| **FINANCE_CLERK** | All HOP permissions + manage budgets, dispatch |

## Tech Stack

### Backend
- Node.js + Express
- MySQL 8.0
- JWT (jsonwebtoken)
- PDFKit (PDF generation)
- ExcelJS (Excel generation)
- bcrypt (password hashing)

### Frontend
- React 18 + TypeScript
- Material-UI (MUI) v5
- React Query (TanStack Query)
- Zustand (state management)
- React Hook Form + Yup (form validation)
- React Router v6

## Project Structure

```
zcceprsystem/
├── database/
│   └── schema.sql          # Complete database schema
├── backend/
│   ├── src/
│   │   ├── config/         # Database and role configuration
│   │   ├── controllers/    # Route handlers
│   │   ├── middleware/     # Auth and validation
│   │   ├── services/       # Business logic
│   │   ├── routes/         # API routes
│   │   └── server.js       # Express server
│   ├── package.json
│   └── .env.example
└── frontend/
    ├── public/
    │   └── index.html
    ├── src/
    │   ├── components/     # React components
    │   ├── pages/          # Page components
    │   ├── services/       # API services
    │   ├── store/          # Zustand stores
    │   ├── types/          # TypeScript types
    │   ├── App.tsx         # Main app with routing
    │   └── index.tsx       # Entry point
    ├── package.json
    └── tsconfig.json
```

## Setup Instructions

### Prerequisites
- Node.js 18+ and npm
- MySQL 8.0+
- Git

### 1. Database Setup

```bash
# Connect to MySQL
mysql -u root -p

# Create database and run schema
CREATE DATABASE finance_erp;
USE finance_erp;
SOURCE database/schema.sql;
```

### 2. Backend Setup

```bash
cd backend

# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env with your database credentials

# Start development server
npm run dev
```

### 3. Frontend Setup

```bash
cd frontend

# Install dependencies
npm install

# Start development server
npm start
```

### 4. Access the Application

- Frontend: http://localhost:3000
- Backend API: http://localhost:5000

### Default Users (from seed data in schema.sql)

| Email | Password | Role |
|-------|----------|------|
| admin@example.com | admin123 | FINANCE_CLERK |
| hop@example.com | hop123 | HEAD_OF_PROGRAMS |
| lead@example.com | lead123 | PROGRAM_LEAD |
| user@example.com | user123 | GENERAL_USER |

*Note: Update passwords in production!*

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login
- `POST /api/auth/refresh` - Refresh access token
- `POST /api/auth/logout` - Logout (invalidate refresh token)

### Requests
- `GET /api/requests` - List requests (filtered by role)
- `POST /api/requests` - Create new request
- `GET /api/requests/:id` - Get request details
- `PUT /api/requests/:id` - Update draft request
- `POST /api/requests/:id/submit` - Submit for approval

### Approvals
- `GET /api/approvals/pending` - Get pending approvals
- `POST /api/approvals/:id/approve` - Approve request
- `POST /api/approvals/:id/reject` - Reject request
- `POST /api/approvals/:id/dispatch` - Mark as dispatched

### Budget Lines
- `GET /api/budgets` - List budget lines
- `POST /api/budgets` - Create budget line (Finance only)
- `PUT /api/budgets/:id` - Update budget line
- `GET /api/budgets/:id/transactions` - Get budget transactions

### Export
- `GET /api/export/dispatch/:id/pdf` - Download dispatch PDF
- `GET /api/export/dispatch/:id/excel` - Download dispatch Excel

## Approval Workflow

```
┌─────────────────┐
│   DRAFT         │ (User creates request)
└────────┬────────┘
         │ Submit
         ▼
┌─────────────────┐
│  PENDING_LEAD   │ (Program Lead reviews)
└────────┬────────┘
         │ Approve
         ▼
┌─────────────────┐
│  PENDING_HOP    │ (Head of Programs reviews)
└────────┬────────┘
         │ Approve
         ▼
┌─────────────────┐
│ PENDING_FINANCE │ (Finance Clerk reviews)
└────────┬────────┘
         │ Approve (Budget deducted here)
         ▼
┌─────────────────┐
│    APPROVED     │ (Ready for dispatch)
└────────┬────────┘
         │ Dispatch
         ▼
┌─────────────────┐
│   DISPATCHED    │ (Items delivered)
└─────────────────┘
```

*Rejection at any step returns the request to REJECTED status*

## Budget Management

- Budget is **only deducted** upon Finance Clerk approval
- Uses **SERIALIZABLE** transaction isolation to prevent race conditions
- **Row-level locking** (FOR UPDATE) ensures atomic updates
- **Optimistic locking** with version numbers for extra safety
- Insufficient balance at approval time causes rejection

## Security Considerations

1. **Password Security**: bcrypt with salt rounds
2. **Token Security**: Short-lived access tokens (15min), longer refresh tokens (7 days)
3. **SQL Injection**: Parameterized queries throughout
4. **XSS Protection**: Helmet middleware, input sanitization
5. **CORS**: Configurable allowed origins
6. **Rate Limiting**: Express-rate-limit on sensitive endpoints

## License

Proprietary - Internal Use Only

## Support

For issues or questions, contact the development team.
