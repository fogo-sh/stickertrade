FROM node:16

WORKDIR /app

COPY ./package.json ./

RUN npm install

COPY ./ .

RUN npm run build:css
RUN npm run build

ENV NODE_ENV=production

CMD ["npm", "run" ,"prod"]