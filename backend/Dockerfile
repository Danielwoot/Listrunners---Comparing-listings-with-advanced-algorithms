FROM ghcr.io/puppeteer/puppeteer:22.0.0

WORKDIR /home/pptruser/app

# Copy dependency configs
COPY --chown=pptruser:pptruser package*.json ./

# Install clean dependencies
RUN npm install --omit=dev

# Copy the rest of the application code
COPY --chown=pptruser:pptruser . .

EXPOSE 3001

CMD ["node", "server.js"]
