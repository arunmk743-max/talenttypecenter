# TALENT TYPE CENTER

The website uses Netlify Database (Postgres) for shared student records, attendance, reports, contact details, courses, practice passages, and batch schedules. Student phone/DOB login and ADMIN password login use server-validated, eight-hour sessions in Netlify Database. Netlify Identity provides private administrator setup and recovery. Uploaded logos use Netlify Blobs. Browser memory is only a temporary view of server data; changes succeed only after the central database confirms them.

## Deploy and first account

Deploy the repository through Netlify. The configured command prepares the static website and bundles its browser dependencies. Netlify deploys the server functions, provisions the database, and applies the migrations automatically. Do not apply database migrations manually.

After deployment, open **Identity** in the Netlify dashboard, invite the administrator's email, and accept the invitation to set a private account password. Open that user in Identity, add the **admin** role, and save. The first administrator role must be assigned in the dashboard.

On the website, open **Admin Panel → Administrator setup / recovery**. Sign in with the invited email and account password. Open **Settings → Admin Security & Password Change**. Verify the account password and choose the password for the **ADMIN** login. There is no preset password in source code. Subsequent sign-ins use **ADMIN** and this privately chosen password. Changes require the current ADMIN password and revoke other ADMIN sessions. Passwords must contain 8–128 characters and are stored using salted scrypt hashes.

For recovery, use **Administrator setup / recovery**, enter the invited administrator email, and select **Forgot password?**. Complete the email recovery flow, sign in through administrator setup, and set a replacement ADMIN password in Settings. Identity administrator access can reset ADMIN; keep that account limited to institute owners.

## Existing browser records

Using the browser and website address that contained the previous records, sign in as an administrator. Under **Enrolled Students Roster**, select **Import records from this browser**. This imports student records, attendance, reports, and public content. Existing central records are retained when their identifiers match; initial public defaults can be replaced by previous browser settings. The import does not delete the browser copy, and retries do not duplicate records with the same identifier.

Browser storage is specific to an address. If records were entered at the former Netlify address or from a local HTML file, they are not automatically available at the new address. Keep that browser data until it has been transferred and checked. No browser credentials are imported.

Students sign in with their registered **10-digit phone number** and date of birth in **DDMMYYYY** format. No student email or account invitation is required. Student email remains optional contact information. Administrators can correct a student's DOB or add new students in the roster. Changing the DOB, deleting the student, or replacing the admission number invalidates existing student sessions. DOB is personal information that may be known to others; this login provides less protection than a private student password.

## Shared data behavior

Student login records attendance centrally once per UTC day, using the server date and an India-local display time. Students receive only their own profile and attendance. Private student lists and reports are never sent to anonymous visitors. Public admission inquiries are added to the private central report queue.

Use **Refresh shared data** in the portal, or reload the website, to load changes from another device. Conflicting administrator saves are rejected rather than overwriting a newer revision. On a conflict, reload the shared data, review the current records, and reapply the edit. Database errors leave the last confirmed view intact and display a failure; there is no browser-only save fallback.

Changing a student's phone number is disabled because existing attendance is keyed by phone number. Administrator recovery and invitation acceptance use email links from Netlify Identity. Public signup is not offered in this website. Login attempts are limited centrally by account and IP over a 15-minute window. Sessions use Secure, HttpOnly, SameSite cookies; state-changing requests require the same origin. Assign administrator roles only to institute staff.

## Checks

Run `npm test` for privacy, validation, and browser data-flow checks, and `npm run check` for TypeScript checking. Live database access and account invitations require a deployed Netlify environment.
