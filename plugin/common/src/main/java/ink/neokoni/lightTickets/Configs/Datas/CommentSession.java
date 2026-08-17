package ink.neokoni.lightTickets.Configs.Datas;

import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
public class CommentSession {
    public static final long TTL_MILLIS = 10 * 60 * 1_000L;
    private int ticketId;
    private String replyToAuthor;
    private String replyToBody;
    private final long createdAtMillis;

    public CommentSession(int ticketId) {
        this.ticketId = ticketId;
        this.replyToAuthor = null;
        this.replyToBody = null;
        this.createdAtMillis = System.currentTimeMillis();
    }

    public CommentSession(int ticketId, String replyToAuthor, String replyToBody) {
        this.ticketId = ticketId;
        this.replyToAuthor = replyToAuthor;
        this.replyToBody = replyToBody;
        this.createdAtMillis = System.currentTimeMillis();
    }

    public boolean isReply() {
        return replyToBody != null && !replyToBody.isEmpty();
    }

    public boolean isExpired() {
        return System.currentTimeMillis() - createdAtMillis >= TTL_MILLIS;
    }
}
