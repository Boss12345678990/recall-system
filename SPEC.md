# Clinic Follow-Up Reminder System — Technical Specification

## 1. Overview

This project is a lightweight web-based follow-up reminder system for a small clinic. It is intended to help clinic staff quickly review today's patients, track each patient's follow-up status, update patient details, and manage revisit appointments.

The initial expected user base is very small (approximately 2–3 staff members), so the system should prioritize simplicity, reliability, maintainability, and low operational cost over large-scale distributed-system complexity.

---

## 2. Business Requirements and Boundaries

### 2.1 Primary Users

- Clinic reception staff
- Clinic staff accessing the system from the clinic computer
- Approximately 2–3 users in the initial deployment

### 2.2 Core User Story

A clinic staff member logs in to the system, views today's patients and their appointment/follow-up status, and updates patient or appointment information when needed.

### 2.3 Current Scope

The first version of the system will support:

- User authentication
- Patient management
- Appointment management
- Today's patient list
- Follow-up status tracking
- Patient status and detail updates
- Basic LINE follow-up/reminder integration

### 2.4 Out of Scope for Initial Version

The following are not required for the first version unless added later:

- Public patient self-service portal
- Complex role-based access control
- Multi-clinic support
- High-volume analytics
- Large-scale event streaming
- Microservice architecture
- Kubernetes deployment

---

## 3. Functional Requirements

### 3.1 Authentication

Users must be able to log in before accessing clinic data.

Initial authentication model:

- One shared clinic account is acceptable for the first version
- Username/password authentication
- Authentication handled using JWT

Future versions may support individual staff accounts and role-based access control.

### 3.2 Main Dashboard

The main dashboard should allow users to:

- View today's patients
- View each patient's appointment/follow-up status
- Quickly identify patients who require follow-up
- Open a patient record for more details

### 3.3 Patient Management

Users should be able to:

- Create a patient
- View a patient
- Edit patient details
- Delete a patient if necessary
- View all patients

Patient information includes:

- Name
- Phone number
- Birth date
- Current follow-up status
- Comments/notes
- Created date

### 3.4 Appointment Management

Users should be able to:

- Create an appointment
- View an appointment
- Update an appointment
- Delete an appointment
- View all appointments for a patient
- View appointments for a specific date

### 3.5 Follow-Up Status Tracking

Each patient should have a status that represents their current follow-up state.

Example statuses:

- 正在追蹤
- 未回覆
- 已完成
- 不需回診

The exact status list should be stored as an enum or controlled value to prevent inconsistent data.

### 3.6 LINE Follow-Up Integration

The system should support basic automation using a LINE agent or LINE Messaging API.

Possible workflow:

1. Clinic staff clicks a call/follow-up action.
2. The system sends or triggers a LINE message.
3. The LINE agent communicates with the patient.
4. The system records the response.
5. If appropriate, the system creates or updates the patient's revisit appointment.

This integration should be treated as a separate module so that the core patient and appointment system remains usable even if the LINE integration is unavailable.

---

## 4. Non-Functional Requirements

### 4.1 Reliability

Patient and appointment status must remain correct and consistent.

Requirements:

- Database writes must be validated before persistence
- Appointment updates should use transactional logic when multiple related records are modified
- API errors must not silently report success
- The application should log failed updates and unexpected exceptions

### 4.2 Availability

Because this is a small clinic application, high availability infrastructure is not required initially.

Initial availability approach:

- One application server instance is sufficient
- Use a managed database
- Configure health checks
- Configure automatic restart if the application crashes

### 4.3 Performance

The expected workload is small, so advanced caching is not required in the first version.

Typical API responses should return within approximately 500 ms under normal clinic usage.

### 4.4 Security

The application should:

- Require authentication for protected routes
- Hash stored passwords using bcrypt or equivalent
- Use HTTPS in production
- Store secrets in environment variables
- Validate request payloads
- Avoid exposing database credentials to the frontend
- Use parameterized ORM queries to reduce SQL injection risk

### 4.5 Maintainability

The backend should follow a modular structure with clear separation between:

- Routes
- Controllers
- Services
- Database access
- Authentication
- External integrations

---

## 5. Estimated Scale

Initial expected scale:

- Users: 2–3 clinic staff
- Patients: hundreds to a few thousand records
- Appointments: low thousands to tens of thousands over time
- Concurrent users: typically fewer than 5
- Request rate: very low

Because of the small scale, the system does not initially require:

- Redis caching
- Kafka
- Message queues
- Read replicas
- Database sharding
- Kubernetes

These can be reconsidered only if real usage later justifies them.

---

## 6. High-Level Architecture

```text
+---------------------+
|   React Web Client  |
|   Vite + JavaScript |
+----------+----------+
           |
           | REST API / HTTPS
           v
+-----------------------------+
|       Node.js API Server    |
|  Express                    |
|                             |
|  - Auth                     |
|  - Patients                 |
|  - Appointments             |
|  - Follow-up Logic          |
|  - LINE Integration         |
+--------------+--------------+
               |
               | Prisma ORM
               v
+-----------------------------+
|       Managed MySQL         |
+-----------------------------+
```

The frontend communicates only with the backend API. The backend is responsible for authentication, validation, business logic, database access, and external LINE integration.

---

## 7. Data Model

## 7.1 User

Represents a clinic user account.

| Field | Type | Description |
|---|---|---|
| `id` | UUID / INT | Primary key |
| `username` | VARCHAR | Login username |
| `passwordHash` | VARCHAR | Hashed password |
| `createdAt` | DATETIME | Creation timestamp |
| `updatedAt` | DATETIME | Last update timestamp |

> The initial version may use a single shared account, but the schema should still support multiple users later.

## 7.2 Patient

| Field | Type | Description |
|---|---|---|
| `id` | UUID / INT | Primary key |
| `name` | VARCHAR | Patient name |
| `phoneNumber` | VARCHAR | Phone number |
| `birthDate` | DATE | Patient birth date |
| `status` | ENUM / VARCHAR | Follow-up status |
| `comment` | TEXT | Staff notes |
| `createdAt` | DATETIME | Creation timestamp |
| `updatedAt` | DATETIME | Last update timestamp |

Relationship:

- One patient can have many appointments

## 7.3 Appointment

| Field | Type | Description |
|---|---|---|
| `id` | UUID / INT | Primary key |
| `patientId` | UUID / INT | Foreign key → Patient |
| `startDate` | DATETIME | Appointment start time |
| `endDate` | DATETIME | Appointment end time |
| `status` | ENUM / VARCHAR | Appointment/follow-up status |
| `createdAt` | DATETIME | Creation timestamp |
| `updatedAt` | DATETIME | Last update timestamp |

Suggested appointment statuses:

- `SCHEDULED`
- `COMPLETED`
- `CANCELLED`
- `NO_RESPONSE`
- `FOLLOW_UP_REQUIRED`

---

## 8. API Specification

Base path:

```text
/api
```

### 8.1 Authentication

#### Login

```http
POST /api/auth/login
```

Request body:

```json
{
  "username": "clinic",
  "password": "password"
}
```

Response:

```json
{
  "token": "jwt-token"
}
```

---

## 8.2 Patient APIs

### Get all patients

```http
GET /api/patients
```

Optional query parameters:

```text
?status=FOLLOW_UP_REQUIRED
?search=John
```

### Get one patient

```http
GET /api/patients/{patientId}
```

### Create a patient

```http
POST /api/patients
```

Example request body:

```json
{
  "name": "Jane Doe",
  "phoneNumber": "4165551234",
  "birthDate": "1990-01-01",
  "status": "FOLLOW_UP_REQUIRED",
  "comment": "Call next week"
}
```

### Update a patient

```http
PATCH /api/patients/{patientId}
```

### Delete a patient

```http
DELETE /api/patients/{patientId}
```

---

## 8.3 Appointment APIs

### Get appointments

```http
GET /api/appointments
```

Useful query parameters:

```text
?date=2026-09-30
?status=SCHEDULED
?patientId=123
```

### Get one appointment

```http
GET /api/appointments/{appointmentId}
```

### Get all appointments for one patient

```http
GET /api/patients/{patientId}/appointments
```

### Create an appointment

```http
POST /api/appointments
```

Example request body:

```json
{
  "patientId": 123,
  "startDate": "2026-10-05T09:00:00",
  "endDate": "2026-10-05T09:30:00",
  "status": "SCHEDULED"
}
```

### Update an appointment

```http
PATCH /api/appointments/{appointmentId}
```

> `appointmentId` identifies exactly which appointment should be updated. `patientId` can be included in the request body only when the relationship itself needs to change.

### Delete an appointment

```http
DELETE /api/appointments/{appointmentId}
```

---

## 9. API Response Conventions

### Successful response example

```json
{
  "success": true,
  "data": {}
}
```

### Error response example

```json
{
  "success": false,
  "error": {
    "code": "PATIENT_NOT_FOUND",
    "message": "Patient does not exist"
  }
}
```

Recommended HTTP status codes:

| Code | Meaning |
|---|---|
| `200` | Successful GET/PATCH/DELETE |
| `201` | Successful POST/create |
| `400` | Invalid request |
| `401` | Authentication required |
| `403` | Unauthorized action |
| `404` | Resource not found |
| `409` | Data conflict |
| `500` | Unexpected server error |
| `503` | Dependent service unavailable |

---

## 10. Tech Stack

### Frontend

- React
- JavaScript
- Vite

Responsibilities:

- Login page
- Dashboard
- Patient list
- Appointment list
- Patient detail/edit forms
- API communication

### Backend

- Node.js
- Express.js
- JavaScript

Responsibilities:

- REST API
- Authentication
- Validation
- Business logic
- Database access
- LINE integration

### Database

- MySQL
- Prisma ORM

MySQL is preferred because the main data is relational:

- Patients
- Appointments
- Users

Appointments naturally reference patients through foreign keys, making a relational database a strong fit.

### Authentication

- JWT
- bcrypt for password hashing

### Deployment

Suggested initial deployment:

- Frontend: Vercel
- Backend: Render
- Database: Managed MySQL provider

Possible managed MySQL providers include:

- Railway
- Aiven
- PlanetScale-compatible MySQL services
- AWS RDS
- Azure Database for MySQL

For this project's scale, a simple managed service is preferable to self-hosting MySQL in Docker or Kubernetes.

---

## 11. Suggested Backend Project Structure

```text
server/
├── src/
│   ├── app.js
│   ├── server.js
│   │
│   ├── routes/
│   │   ├── auth.routes.js
│   │   ├── patient.routes.js
│   │   └── appointment.routes.js
│   │
│   ├── controllers/
│   │   ├── auth.controller.js
│   │   ├── patient.controller.js
│   │   └── appointment.controller.js
│   │
│   ├── services/
│   │   ├── auth.service.js
│   │   ├── patient.service.js
│   │   ├── appointment.service.js
│   │   └── line.service.js
│   │
│   ├── middleware/
│   │   ├── auth.middleware.js
│   │   ├── error.middleware.js
│   │   └── validation.middleware.js
│   │
│   ├── validators/
│   │   ├── patient.validator.js
│   │   └── appointment.validator.js
│   │
│   └── lib/
│       └── prisma.js
│
├── prisma/
│   ├── schema.prisma
│   └── migrations/
│
├── tests/
├── .env
├── .env.example
├── package.json
└── Dockerfile
```

---

## 12. Suggested Frontend Project Structure

```text
client/
├── src/
│   ├── components/
│   ├── pages/
│   │   ├── LoginPage.jsx
│   │   ├── DashboardPage.jsx
│   │   ├── PatientsPage.jsx
│   │   └── PatientDetailPage.jsx
│   │
│   ├── services/
│   │   └── api.js
│   │
│   ├── hooks/
│   ├── context/
│   ├── utils/
│   ├── App.jsx
│   └── main.jsx
│
├── package.json
└── vite.config.js
```

---

## 13. Validation Rules

Examples:

### Patient

- `name` is required
- `phoneNumber` should contain a valid phone format
- `birthDate` cannot be in the future
- `status` must match an allowed status value

### Appointment

- `patientId` is required
- Patient must exist before appointment creation
- `startDate` is required
- `endDate` must be later than `startDate`
- `status` must match an allowed appointment status

---

## 14. Error Handling

The backend should use centralized error handling.

Examples:

- Patient does not exist → `404`
- Appointment does not exist → `404`
- Invalid request body → `400`
- Database temporarily unavailable → `503` or `500`
- Unexpected application error → `500`

The backend must not return `200 OK` if a requested operation actually failed.

---

## 15. Logging and Monitoring

Minimum production logging should include:

- Request method and path
- HTTP status code
- Unexpected exceptions
- Failed database operations
- LINE integration failures

Future improvements may include:

- Sentry
- Better structured logging
- Uptime monitoring
- Audit history for patient status changes

---

## 16. Deployment Architecture

```text
                Internet
                   |
                   v
          +----------------+
          |     Vercel     |
          | React Frontend |
          +--------+-------+
                   |
                   | HTTPS REST API
                   v
          +----------------+
          |     Render     |
          | Node/Express   |
          +--------+-------+
                   |
                   | Prisma
                   v
          +----------------+
          | Managed MySQL  |
          +----------------+
```

The backend may also communicate with LINE services through HTTPS APIs.

---

## 17. Development Priorities

Recommended implementation order:

1. Initialize React/Vite frontend
2. Initialize Express backend
3. Configure MySQL and Prisma
4. Create User, Patient, and Appointment schemas
5. Implement authentication
6. Implement patient CRUD APIs
7. Implement appointment CRUD APIs
8. Build dashboard for today's appointments
9. Add patient status updates
10. Add frontend validation and error states
11. Add production deployment
12. Add LINE integration
13. Add logging and monitoring

---

## 18. Future Enhancements

Potential future improvements:

- Individual staff accounts
- Role-based permissions
- Patient history/audit log
- SMS reminders
- LINE chatbot automation
- Calendar view
- Search and filtering
- Reporting dashboard
- Appointment conflict detection
- WebSocket or Server-Sent Events for live updates
- Background job queue if reminder volume grows
- Redis only if caching or distributed session needs later justify it

---

## 19. Key Design Decisions

### Why REST?

The application has straightforward CRUD-style resources such as patients and appointments. REST is simple and sufficient for the current requirements.

### Why MySQL?

The data has clear relational structure, especially the one-to-many relationship between patients and appointments. MySQL provides strong consistency and foreign-key support.

### Why Prisma?

Prisma provides:

- Schema definition
- Migrations
- Type-safe database access
- Cleaner database code than manual SQL for this project size

### Why No Redis Initially?

The user base is only 2–3 users and the dataset is small. The database can handle the expected read volume directly.

### Why No Kafka or Message Queue Initially?

There is no high-throughput asynchronous workload in the initial version. Adding a queue would increase complexity without meaningful benefit.

### Why No Kubernetes Initially?

The application can run reliably as one backend service and one managed database. Kubernetes would introduce unnecessary operational overhead at this scale.

---

## 20. Definition of MVP

The MVP is complete when clinic staff can:

- Log in
- View today's patients
- View patient details
- Create/edit/delete patients
- Create/edit/delete appointments
- View all appointments for a patient
- Update patient follow-up status
- See clear success/error feedback
- Use the deployed application from the clinic computer

LINE automation can be added immediately after the core MVP is stable.
