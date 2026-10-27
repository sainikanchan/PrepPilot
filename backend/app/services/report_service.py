from statistics import mean

def avg(vals): return round(mean(vals)) if vals else 0

def build_report(session):
    answers = session.answers
    answer_scores=[a.score for a in answers]
    content = avg(answer_scores)
    confidence=avg([a.confidence_score for a in answers if a.confidence_score])
    relevance=avg([a.relevance_score for a in answers if a.relevance_score])
    technical=avg([a.technical_score for a in answers if a.technical_score])
    clarity=avg([a.clarity_score for a in answers if a.clarity_score])
    structure=avg([a.structure_score for a in answers if a.structure_score])
    speech=avg([a.speech_pace_score for a in answers if a.speech_pace_score])
    eye=avg([a.eye_contact_score for a in answers if a.eye_contact_score])
    pause=avg([a.pause_control_score for a in answers if a.pause_control_score])
    face=avg([a.face_presence_score for a in answers if a.face_presence_score])
    expression=avg([a.expression_engagement_score for a in answers if a.expression_engagement_score])
    delivery_available=any(a.confidence_score or a.eye_contact_score or a.speech_pace_score or a.pause_control_score or a.face_presence_score or a.expression_engagement_score for a in answers)
    overall=round(content*.65 + confidence*.35) if confidence else content
    strengths=[]; weaknesses=[]
    if relevance>=75: strengths.append("Answers generally stay relevant to the question.")
    else: weaknesses.append("Make the first part of each answer directly address the question.")
    if technical>=75: strengths.append("Good coverage of expected technical or domain concepts.")
    else: weaknesses.append("Include more of the key concepts expected for the topic.")
    if clarity>=75: strengths.append("Responses are reasonably clear and structured.")
    else: weaknesses.append("Shorten long sentences and reduce filler language.")
    if not strengths: strengths.append("You completed the interview and generated measurable performance data.")
    if not weaknesses: weaknesses.append("Continue practicing concise, evidence-based answers.")
    recs=["Lead with the direct answer before adding supporting detail.","Use concrete examples and measurable outcomes.","Review the missing concepts shown after each question."]
    details = []
    for answer in sorted(answers, key=lambda item: item.id):
        question = answer.question
        details.append({"question": question.text, "difficulty": question.difficulty,
          "category": question.category, "answer": answer.answer, "score": answer.score,
          "relevance": answer.relevance_score, "correctness": answer.technical_score if question.category == "technical" else None,
          "correctnessNote": "Heuristic estimate only; TF-IDF/concept overlap does not verify correctness." if question.category == "technical" else "Not scored for behavioral question.",
          "clarity": answer.clarity_score, "completeness": answer.concept_coverage,
          "coveredConcepts": answer.matched_concepts or [], "missingConcepts": answer.missing_concepts or [],
          "feedback": answer.feedback or [],
          "explanation": "Scores are heuristic signals from question-term overlap, expected concepts, TF-IDF reference comparison, clarity, and structure; they do not establish semantic understanding.",
          "scoringMethod": "25% question-term overlap, 35% expected-concept coverage/reference TF-IDF, 20% clarity, 20% structure; behavioral STAR is separate.",
          "starAnalysis": answer.star_analysis or {},
          "evaluationStatus": answer.evaluation_status or "evaluated"})
    subtitle="Content and observable delivery analysis from your completed interview" if delivery_available else "Content analysis from your completed interview; no delivery metrics were available"
    return {"sessionId":session.id,"score":overall,"subtitle":subtitle,"domain":session.domain,"difficulty":session.difficulty,
      "skillCards":[{"name":"Answer quality","score":content},{"name":"Relevance","score":relevance},{"name":"Technical depth","score":technical},{"name":"Clarity","score":clarity},{"name":"Structure","score":structure}],
      "confidenceAnalysis":{"available":delivery_available,"confidenceScore":confidence,"eyeContactScore":eye,"speechPaceScore":speech,"pauseControlScore":pause,"facePresenceScore":face,"expressionEngagementScore":expression},
      "answerAnalysis":{"answerQuality":content,"relevance":relevance,"technicalDepth":technical,"clarity":clarity,"structure":structure,"answersEvaluated":len(answers),"details":details},
      "adaptationHistory":session.adaptation_history or [],
      "strengths":strengths,"weaknesses":weaknesses,"recommendations":recs}
