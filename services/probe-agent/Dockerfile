FROM golang:1.24-alpine AS build
WORKDIR /src
COPY go.mod ./
COPY main.go ./
RUN go mod tidy
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /out/probe-agent .

FROM alpine:3.21
RUN addgroup -S agent && adduser -S -G agent agent && mkdir -p /var/lib/probe-agent && chown agent:agent /var/lib/probe-agent
COPY --from=build /out/probe-agent /usr/local/bin/probe-agent
USER agent
VOLUME ["/var/lib/probe-agent"]
ENV AGENT_QUEUE_DB=/var/lib/probe-agent/queue.sqlite
EXPOSE 3300
ENTRYPOINT ["/usr/local/bin/probe-agent"]
