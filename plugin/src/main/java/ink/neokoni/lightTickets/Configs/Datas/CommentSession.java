package ink.neokoni.lightTickets.Configs.Datas;

import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
public class CommentSession {
    private int ticketId;
    private String replyToAuthor;
    private String replyToBody;

    public CommentSession(int ticketId) {
        this.ticketId = ticketId;
        this.replyToAuthor = null;
        this.replyToBody = null;
    }

    public CommentSession(int ticketId, String replyToAuthor, String replyToBody) {
        this.ticketId = ticketId;
        this.replyToAuthor = replyToAuthor;
        this.replyToBody = replyToBody;
    }

    public boolean isReply() {
        return replyToBody != null && !replyToBody.isEmpty();
    }
}
