"""Tests for query_classifier — classify and refine user messages for RAG."""

from app.services.companion.query_classifier import classify_query, refine_rag_query


class TestClassifyQuery:
    def test_skip_greeting_english(self):
        assert classify_query('hello', []) == 'skip'

    def test_skip_greeting_chinese(self):
        assert classify_query('你好', []) == 'skip'

    def test_skip_thanks(self):
        assert classify_query('thanks', []) == 'skip'

    def test_skip_short_filler(self):
        assert classify_query('ok', []) == 'skip'
        assert classify_query('好的', []) == 'skip'

    def test_skip_very_short(self):
        assert classify_query('abc', []) == 'skip'

    def test_content_question_why(self):
        assert classify_query('why did the character do that?', []) == 'content'

    def test_content_short_question_why(self):
        assert classify_query('why?', []) == 'content'

    def test_content_short_question_how(self):
        assert classify_query('how?', []) == 'content'

    def test_content_short_who(self):
        assert classify_query('who?', []) == 'content'

    def test_content_question_chinese(self):
        assert classify_query('为什么主角要这样做？', []) == 'content'

    def test_content_literary_term(self):
        assert classify_query('the theme of the novel', []) == 'content'

    def test_content_chinese_literary_term(self):
        assert classify_query('这本书的情节怎么样', []) == 'content'

    def test_content_reading_position(self):
        assert classify_query('what happened so far?', []) == 'content'

    def test_content_chinese_reading_position(self):
        assert classify_query('到现在发生了什么', []) == 'content'

    def test_general_chitchat(self):
        assert classify_query('I really enjoy reading this', []) == 'general'

    def test_general_medium_message(self):
        assert classify_query('this is an interesting book', []) == 'general'


class TestRefineRagQuery:
    def test_strips_can_you_tell_me(self):
        result = refine_rag_query('can you tell me about the symbolism?', [])
        assert 'symbolism' in result
        assert 'can you tell me' not in result.lower()

    def test_strips_please_explain(self):
        result = refine_rag_query('please explain the metaphor', [])
        assert 'metaphor' in result

    def test_strips_chinese_filler(self):
        result = refine_rag_query('我想知道这本书的主题', [])
        assert '主题' in result
        assert '我想知道' not in result

    def test_strips_chinese_explain(self):
        result = refine_rag_query('请解释一下这个情节', [])
        assert '情节' in result

    def test_fallback_when_too_short(self):
        result = refine_rag_query('please explain', [])
        assert result == 'please explain'

    def test_preserves_meaningful_query(self):
        original = 'what is the significance of the green light?'
        result = refine_rag_query(original, [])
        assert 'green light' in result

    def test_no_stripping_needed(self):
        original = 'the main character motivation'
        result = refine_rag_query(original, [])
        assert result == original
