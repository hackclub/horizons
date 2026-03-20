# HORIZONS

## Environment Variables

You'll need to set ENV vars for both the backend and frontend.

Backend:
```yaml
#url to postgres db; you can use db.prisma.io
DATABASE_URL=

#create a sample app to get these from HCA
#app requires ODIC/OpenID
HACKCLUB_CLIENT_ID=
HACKCLUB_CLIENT_SECRET=
HACKCLUB_REDIRECT_URI=

#use `openssl rand -base64 32` to generate a state secret
STATE_SECRET=
```

Frontend:
```yaml
PUBLIC_API_URL=http://localhost:3000
```

## Running locally

Run `pnpm i` to install dependencies then `cd backend && pnpx prisma generate` to generate the prisma client.

Once the dev environment is set up, run `pnpm run dev` and open the site at `localhost:3000`. Enjoy!