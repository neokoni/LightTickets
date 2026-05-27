package ink.neokoni.lighttickets.model;

import java.util.Map;

public class Ticket {
    private final int id;
    private final String title;
    private final String body;
    private final String type;
    private final String status;
    private final String priority;
    private final String createdAt;

    private static final Map<String, String> STATUS_NAMES = Map.of(
        "open", "待处理",
        "in_progress", "处理中",
        "resolved", "已解决",
        "closed", "已关闭",
        "rejected", "已拒绝"
    );

    private static final Map<String, String> TYPE_NAMES = Map.of(
        "bug_report", "Bug报告",
        "permission_request", "权限申请",
        "suggestion", "建议",
        "report", "举报"
    );

    public Ticket(int id, String title, String body, String type, String status, String priority, String createdAt) {
        this.id = id;
        this.title = title;
        this.body = body;
        this.type = type;
        this.status = status;
        this.priority = priority;
        this.createdAt = createdAt;
    }

    public int getId() { return id; }
    public String getTitle() { return title; }
    public String getBody() { return body; }
    public String getType() { return type; }
    public String getStatus() { return status; }
    public String getPriority() { return priority; }
    public String getCreatedAt() { return createdAt; }

    public String getStatusName() {
        return STATUS_NAMES.getOrDefault(status, status);
    }

    public String getTypeName() {
        return TYPE_NAMES.getOrDefault(type, type);
    }
}
