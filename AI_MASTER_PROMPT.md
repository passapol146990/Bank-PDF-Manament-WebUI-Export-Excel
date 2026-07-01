Role: You are an Expert Full-Stack Developer and System Architect. Your goal is to build a "Bank Statement Categorization Web Application". 

Tech Stack: 
- Backend: Python, FastAPI, SQLAlchemy (SQLite for development), Pandas (for data processing)
- Frontend: React (Vite), Tailwind CSS, Axios, Recharts (for dashboard)

Project Context:
The application allows users to import bank statement data (from Excel/CSV), display it in a grid identical to a physical PDF statement, categorize transactions via dropdowns, support bulk selection, auto-save progress, and export the final categorized data back to Excel.

Please act as a coordinator and execute the development using the following 4 Sub-Agents. Do not write all the code at once. Acknowledge this prompt, and ask me to proceed with Sub-Agent 1.

### Sub-Agent 1: Database & Data Modeling (The Foundation)
Task: Design the database schema and initialize the FastAPI project.
Requirements:
* Create a SQLAlchemy model named `Transaction`.
* Columns needed: `id`, `date`, `particulars`, `withdrawal` (float, nullable), `deposit` (float, nullable), `balance` (float, nullable), `via`, `category` (string, default: 'Uncategorized'), `status` (string, default: 'pending').
* Create a SQLAlchemy model named `CategoryConfig` to store user-defined categories (e.g., "จ่ายพนักงาน", "ซื้อของ").
* Set up database connection (SQLite) and basic CRUD helper functions.

### Sub-Agent 2: Backend API & Data Processing (The Engine)
Task: Build the FastAPI endpoints for data manipulation and Excel handling.
Requirements:
* Build RESTful endpoints: `GET /transactions`, `PUT /transactions/{id}` (for auto-save), and `PUT /transactions/bulk` (for bulk categorization).
* Implement `POST /upload`: Use `pandas` to read an uploaded Excel file and insert rows into the database.
* Implement `GET /export`: Use `pandas` and `openpyxl` to query the database, apply cell coloring based on categories (e.g., Red for expenses, Green for income), and return an `.xlsx` file.
* Ensure CORS is configured for the React frontend.

### Sub-Agent 3: Frontend UI & Interactive Grid (The View)
Task: Build the React application with a focus on UX and Tailwind CSS styling.
Requirements:
* Create a main `StatementGrid` component displaying transactions in a table resembling a bank statement.
* Implement Row Selection (checkboxes for bulk actions) and a Sticky Header.
* Each row must have a `Category` dropdown. When changed, it must trigger an auto-save API call to the backend.
* Create a "Bulk Apply Category" feature allowing users to select multiple rows and apply a category simultaneously.
* Implement toast notifications for Auto-save success/failure.

### Sub-Agent 4: Dashboard & Analytics (The Insights)
Task: Build the real-time summary dashboard component.
Requirements:
* Create a `DashboardSummary` component placed above or beside the main grid.
* Display total progress: "Categorized: X / Total: Y" (with a progress bar).
* Show aggregate metrics: "Total Withdrawal", "Total Deposit", and "Uncategorized Amount".
* Use `Recharts` to display a simple bar or pie chart breaking down the sum of transactions by Category.
* Ensure the dashboard updates dynamically when a row's category is changed.