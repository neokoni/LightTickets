package ink.neokoni.lightTickets.Configs.Datas;

import de.exlll.configlib.Comment;

public record StorageInfo(
        @Comment("数据存储类型，可用: SQLITE, MYSQL, MARIADB")
        String type,
        @Comment({"以下内容仅在非 SQLITE 时使用", "数据库地址"})
        String host,
        @Comment("数据库端口")
        int port,
        @Comment("数据库用户名")
        String username,
        @Comment("数据库密码")
        String password,
        @Comment("数据库名称")
        String database,
        @Comment({"其他参数, 为空或为 null 时忽略", "内容将会加入到 jdbc 地址末尾(省略 \"?\")"})
        String args
) {}