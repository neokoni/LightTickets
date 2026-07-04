UPDATE `ticket_templates`
SET `completion_hooks` = '[{"event":"closed","type":"minimessage","messages":["<color:#ffffff>你的权限申请 </color><color:#96bfff>#{ticket_id}</color><color:#ffffff> 已通过</color>"]},{"event":"invalid","type":"minimessage","messages":["<color:#ffffff>你的权限申请 </color><color:#96bfff>#{ticket_id}</color><color:#ff8181> 已被拒绝</color>"]}]'
WHERE `name` = 'permission_request';

UPDATE `ticket_templates`
SET `completion_hooks` = '[{"event":"closed","type":"minimessage","messages":["<color:#ffffff>你的建议 </color><color:#96bfff>#{ticket_id}</color><color:#ffffff> 已被采纳</color>"]}]'
WHERE `name` = 'suggestion';
