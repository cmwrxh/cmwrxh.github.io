FROM golang:1.24-alpine AS build
WORKDIR /src
COPY go.mod ./
RUN go mod tidy
COPY main.go ./
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /out/rum-ingest .

FROM alpine:3.21
RUN apk add --no-cache ca-certificates && addgroup -S rum && adduser -S -G rum rum && mkdir -p /app/data
COPY --from=build /out/rum-ingest /usr/local/bin/rum-ingest
USER rum
VOLUME ["/app/data"]
EXPOSE 3400
ENTRYPOINT ["/usr/local/bin/rum-ingest"]
