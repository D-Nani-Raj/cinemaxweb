# Cinemax Online Movie Site

Full-stack movie website with:

- user signup and login
- admin-only movie management
- real poster upload from the admin's computer
- real movie-file upload from the admin's computer
- persistent movie records stored on the server
- shared catalog visible to all logged-in users on the hosted link

## Default admin login

- Email: `admin@cinimax.local`
- Password: `Admin@123`

## Run locally

```bash
node server.js
```

Open `http://localhost:3000`

## How uploads work

- Poster files and movie files are stored in the server `uploads/` folder.
- Movie records are stored in `data/db.json`.
- When the admin uploads a movie, every logged-in user can see that movie from the hosted website because the app serves those files from the same server.

## Important hosting note

For added movies to stay visible to everyone after deploy, your public host must keep these folders persistent:

- `data/`
- `uploads/`

If your host uses an ephemeral filesystem, uploaded movies can disappear after restart or redeploy. For true permanent hosting, use one of these:

1. A VPS or your own server
2. A host with a persistent disk/volume
3. External storage later, such as S3 for files and a managed database for movie records

## Deploy options

### Option 1: VPS or your own machine

1. Copy this project to the server
2. Run `node server.js`
3. Put Nginx or another reverse proxy in front of it
4. Point your domain to that server

### Option 2: Docker host

Build:

```bash
docker build -t cinimax .
```

Run:

```bash
docker run -p 3000:3000 -v /your/persistent/data:/app/data -v /your/persistent/uploads:/app/uploads cinimax
```

Those mounted folders make uploaded movies and posters survive container restarts.

### Option 3: Render

This project includes a `render.yaml` for Render deployment with a persistent disk.

Note: Render persistent disks require a paid web service. A Free web service will run, but uploaded posters, videos, and `db.json` data will be lost whenever the service restarts, redeploys, or spins down.

1. Push the project to GitHub
2. In Render, choose `New +` -> `Blueprint`
3. Select this repository
4. Render will create:
   - a Node web service
   - a persistent disk mounted at `/var/data/cinemax`
5. Deploy

The app will store:

- movie records in `/var/data/cinemax/data/db.json`
- uploaded posters and videos in `/var/data/cinemax/uploads`

That means admin-added movies survive restarts and redeploys on Render.

## Admin usage

1. Log in as admin
2. Open the admin dashboard
3. Fill in movie details
4. Choose a poster file and/or movie file from your computer
5. Save the movie

After that, any logged-in user opening the hosted link will see the added movie in the shared library.
